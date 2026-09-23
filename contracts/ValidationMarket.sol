// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./proxy/Initializable.sol";
import "./proxy/UUPSUpgradeable.sol";

/**
 * @title ValidationMarket
 * @notice Upgradeable Decentralized Fact-Checking Validation Market with Slashed Pool Evidence Bounties,
 * EIP-712 Settlement, M-of-N Juror Quorums & Capital-Lock Protection (UUPS / ERC-1967).
 */
contract ValidationMarket is Initializable, UUPSUpgradeable {
    enum Outcome { VERIFIED, MISINFORMED, DISPUTED, NEED_CONTEXT }
    enum MarketStatus { ACTIVE, SETTLED, REFUNDED }

    struct Market {
        bytes32 id;
        string claimText;
        address creator;
        uint256 createdAt;
        uint256 totalPool;
        uint256[4] outcomePools;
        Outcome finalVerdict;
        MarketStatus status;
        address decisiveWhistleblower;
        address[] participatingJurors;
        uint256 evidenceBounty;
        uint256 jurorQuorumPool;
        uint256 protocolFee;
        uint256 distributablePool;
        bool winningPoolZero; // Flagged when no stakers chose the winning outcome
    }

    address public owner;
    address public protocolTreasury;
    address public oracleSigner;
    bytes32 public DOMAIN_SEPARATOR;

    uint256 public accumulatedProtocolFees;
    bool private _locked;

    bytes32 public constant VERDICT_TYPEHASH = keccak256(
        "VerdictAttestation(bytes32 marketId,uint8 verdict,address decisiveWhistleblower,address[] jurors,uint256 timestamp,uint256 nonce)"
    );

    mapping(bytes32 => Market) public markets;
    mapping(bytes32 => mapping(address => mapping(uint8 => uint256))) public stakes;
    mapping(bytes32 => mapping(address => bool)) public hasClaimed;
    mapping(bytes32 => bool) public usedNonces;

    event MarketCreated(bytes32 indexed marketId, string claimText, address indexed creator, uint256 initialStake, uint8 outcome);
    event StakePlaced(bytes32 indexed marketId, address indexed staker, uint8 outcome, uint256 amount);
    event MarketSettled(bytes32 indexed marketId, Outcome finalVerdict, uint256 evidenceBounty, uint256 jurorPool, bool winningPoolZero);
    event MarketSettledMultiSig(bytes32 indexed marketId, Outcome indexed finalVerdict, uint256 evidenceBounty, uint256 jurorQuorumPool, uint256 signaturesCount, uint256 requiredQuorum);
    event PayoutClaimed(bytes32 indexed marketId, address indexed claimant, uint256 amount);
    event OracleSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event ProtocolTreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event ProtocolFeesWithdrawn(address indexed treasury, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Caller is not the owner");
        _;
    }

    modifier nonReentrant() {
        require(!_locked, "ReentrancyGuard: reentrant call");
        _locked = true;
        _;
        _locked = false;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the upgradeable ValidationMarket logic
     */
    function initialize(address _protocolTreasury, address _oracleSigner) external initializer {
        require(_protocolTreasury != address(0), "Invalid treasury");
        require(_oracleSigner != address(0), "Invalid oracle signer");
        owner = msg.sender;
        protocolTreasury = _protocolTreasury;
        oracleSigner = _oracleSigner;

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("VeracitiesValidationMarket")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    /**
     * @notice Restricts contract upgrades to the owner
     */
    function _authorizeUpgrade(address /* newImplementation */) internal view override onlyOwner {}

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner is zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function updateOracleSigner(address newSigner) external onlyOwner {
        require(newSigner != address(0), "New signer is zero address");
        emit OracleSignerUpdated(oracleSigner, newSigner);
        oracleSigner = newSigner;
    }

    function updateProtocolTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "New treasury is zero address");
        emit ProtocolTreasuryUpdated(protocolTreasury, newTreasury);
        protocolTreasury = newTreasury;
    }

    function withdrawProtocolFees() external nonReentrant {
        uint256 amount = accumulatedProtocolFees;
        require(amount > 0, "No accumulated fees");
        accumulatedProtocolFees = 0;

        (bool success, ) = protocolTreasury.call{value: amount}("");
        require(success, "Protocol fee transfer failed");

        emit ProtocolFeesWithdrawn(protocolTreasury, amount);
    }

    function createMarket(string memory claimText, uint8 initialOutcome) external payable nonReentrant returns (bytes32) {
        require(msg.value > 0, "Initial stake required");
        require(initialOutcome <= uint8(Outcome.NEED_CONTEXT), "Invalid outcome");

        bytes32 marketId = keccak256(abi.encodePacked(claimText, msg.sender, block.timestamp));
        require(markets[marketId].createdAt == 0, "Market already exists");

        Market storage m = markets[marketId];
        m.id = marketId;
        m.claimText = claimText;
        m.creator = msg.sender;
        m.createdAt = block.timestamp;
        m.status = MarketStatus.ACTIVE;
        m.totalPool = msg.value;
        m.outcomePools[initialOutcome] = msg.value;

        stakes[marketId][msg.sender][initialOutcome] = msg.value;

        emit MarketCreated(marketId, claimText, msg.sender, msg.value, initialOutcome);
        return marketId;
    }

    function placeStake(bytes32 marketId, uint8 outcome) external payable nonReentrant {
        Market storage m = markets[marketId];
        require(m.status == MarketStatus.ACTIVE, "Market not active");
        require(msg.value > 0, "Stake must be > 0");
        require(outcome <= uint8(Outcome.NEED_CONTEXT), "Invalid outcome");

        m.totalPool += msg.value;
        m.outcomePools[outcome] += msg.value;
        stakes[marketId][msg.sender][outcome] += msg.value;

        emit StakePlaced(marketId, msg.sender, outcome, msg.value);
    }

    /**
     * @notice Internal settlement processor applying the losing pool slashing waterfall.
     */
    function _executeSettlement(
        bytes32 marketId,
        uint8 verdict,
        address decisiveWhistleblower,
        address[] memory jurors
    ) internal {
        Market storage m = markets[marketId];
        m.status = MarketStatus.SETTLED;
        m.finalVerdict = Outcome(verdict);
        m.decisiveWhistleblower = decisiveWhistleblower;
        m.participatingJurors = jurors;

        // Losing Pool = Total Pool - Winning Pool
        uint256 winningPool = m.outcomePools[verdict];
        uint256 losingPool = m.totalPool > winningPool ? m.totalPool - winningPool : 0;

        uint256 protoFee = (m.totalPool * 5) / 100; // 5% protocol fee
        uint256 evidenceBounty = (losingPool > 0 && decisiveWhistleblower != address(0)) ? (losingPool * 15) / 100 : 0;
        uint256 jurorPool = (losingPool > 0 && jurors.length > 0) ? (losingPool * 5) / 100 : 0;

        uint256 netDeductions = protoFee + evidenceBounty + jurorPool;
        uint256 distributable = m.totalPool > netDeductions ? m.totalPool - netDeductions : 0;

        m.protocolFee = protoFee;
        m.evidenceBounty = evidenceBounty;
        m.jurorQuorumPool = jurorPool;
        m.distributablePool = distributable;

        if (winningPool == 0) {
            m.winningPoolZero = true;
        }

        accumulatedProtocolFees += protoFee;
    }

    /**
     * @notice Settles market using EIP-712 signed oracle attestation (Single Relayer Mode).
     */
    function settleMarket(
        bytes32 marketId,
        uint8 verdict,
        address decisiveWhistleblower,
        address[] calldata jurors,
        uint256 timestamp,
        uint256 nonce,
        bytes calldata signature
    ) external nonReentrant {
        Market storage m = markets[marketId];
        require(m.status == MarketStatus.ACTIVE, "Market not active");
        require(verdict <= uint8(Outcome.NEED_CONTEXT), "Invalid verdict");
        require(!usedNonces[bytes32(nonce)], "Nonce already used");
        require(block.timestamp <= timestamp + 7 days, "Attestation expired");

        bytes32 structHash = keccak256(
            abi.encode(
                VERDICT_TYPEHASH,
                marketId,
                verdict,
                decisiveWhistleblower,
                keccak256(abi.encodePacked(jurors)),
                timestamp,
                nonce
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        address signer = recoverSigner(digest, signature);
        require(signer == oracleSigner, "Invalid oracle signature");

        usedNonces[bytes32(nonce)] = true;
        _executeSettlement(marketId, verdict, decisiveWhistleblower, jurors);

        emit MarketSettled(marketId, m.finalVerdict, m.evidenceBounty, m.jurorQuorumPool, m.winningPoolZero);
    }

    /**
     * @notice Settles market using M-of-N citizen juror threshold EIP-712 signatures.
     */
    function settleMarketMultiSig(
        bytes32 marketId,
        uint8 verdict,
        address decisiveWhistleblower,
        address[] calldata jurors,
        uint256 timestamp,
        uint256 nonce,
        bytes[] calldata signatures
    ) external nonReentrant {
        Market storage m = markets[marketId];
        require(m.status == MarketStatus.ACTIVE, "Market not active");
        require(verdict <= uint8(Outcome.NEED_CONTEXT), "Invalid verdict");
        require(!usedNonces[bytes32(nonce)], "Nonce already used");
        require(block.timestamp <= timestamp + 7 days, "Attestation expired");
        require(jurors.length > 0, "No jurors provided");

        uint256 requiredQuorum = (jurors.length * 2 + 2) / 3;
        require(signatures.length >= requiredQuorum, "Quorum threshold not met");

        bytes32 structHash = keccak256(
            abi.encode(
                VERDICT_TYPEHASH,
                marketId,
                verdict,
                decisiveWhistleblower,
                keccak256(abi.encodePacked(jurors)),
                timestamp,
                nonce
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));

        address[] memory seenSigners = new address[](signatures.length);
        uint256 validSignersCount = 0;

        for (uint256 i = 0; i < signatures.length; i++) {
            address recovered = recoverSigner(digest, signatures[i]);
            require(recovered != address(0), "Invalid signature");

            bool isJuror = false;
            for (uint256 j = 0; j < jurors.length; j++) {
                if (jurors[j] == recovered) {
                    isJuror = true;
                    break;
                }
            }
            require(isJuror, "Signer is not an authorized summoned juror");

            for (uint256 k = 0; k < validSignersCount; k++) {
                require(seenSigners[k] != recovered, "Duplicate juror signature detected");
            }

            seenSigners[validSignersCount] = recovered;
            validSignersCount++;
        }

        require(validSignersCount >= requiredQuorum, "Insufficient unique valid juror signatures");

        usedNonces[bytes32(nonce)] = true;
        _executeSettlement(marketId, verdict, decisiveWhistleblower, jurors);

        emit MarketSettledMultiSig(marketId, m.finalVerdict, m.evidenceBounty, m.jurorQuorumPool, signatures.length, requiredQuorum);
    }

    /**
     * @notice Claim winning wager payout, whistleblower bounty, or juror deliberation fee.
     */
    function claimPayout(bytes32 marketId) external nonReentrant {
        Market storage m = markets[marketId];
        require(m.status == MarketStatus.SETTLED, "Market not settled");
        require(!hasClaimed[marketId][msg.sender], "Already claimed");

        uint256 payout = 0;

        if (msg.sender == m.decisiveWhistleblower && m.evidenceBounty > 0) {
            payout += m.evidenceBounty;
        }

        if (m.jurorQuorumPool > 0 && m.participatingJurors.length > 0) {
            for (uint256 i = 0; i < m.participatingJurors.length; i++) {
                if (m.participatingJurors[i] == msg.sender) {
                    payout += m.jurorQuorumPool / m.participatingJurors.length;
                    break;
                }
            }
        }

        if (m.winningPoolZero) {
            uint256 userTotalStake = getUserTotalStake(marketId, msg.sender);
            if (userTotalStake > 0 && m.totalPool > 0) {
                payout += (userTotalStake * m.distributablePool) / m.totalPool;
            }
        } else {
            uint8 winningOutcome = uint8(m.finalVerdict);
            uint256 userStake = stakes[marketId][msg.sender][winningOutcome];
            uint256 winningPool = m.outcomePools[winningOutcome];

            if (userStake > 0 && winningPool > 0) {
                uint256 stakerYield = (userStake * m.distributablePool) / winningPool;
                payout += stakerYield;
            }
        }

        require(payout > 0, "No payout available");
        hasClaimed[marketId][msg.sender] = true;

        (bool success, ) = msg.sender.call{value: payout}("");
        require(success, "Payout transfer failed");

        emit PayoutClaimed(marketId, msg.sender, payout);
    }

    function getUserTotalStake(bytes32 marketId, address user) public view returns (uint256) {
        return stakes[marketId][user][0] +
               stakes[marketId][user][1] +
               stakes[marketId][user][2] +
               stakes[marketId][user][3];
    }

    function recoverSigner(bytes32 hash, bytes memory sig) internal pure returns (address) {
        require(sig.length == 65, "Invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        return ecrecover(hash, v, r, s);
    }

    function getOutcomePools(bytes32 marketId) external view returns (uint256[4] memory) {
        return markets[marketId].outcomePools;
    }

    // Storage gap for future upgrades
    uint256[46] private __gap;
}
