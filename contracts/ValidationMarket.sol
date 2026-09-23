// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ValidationMarket
 * @notice Decentralized Fact-Checking Validation Market with Slashed Pool Evidence Bounties & EIP-712 Settlement
 */
contract ValidationMarket {
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
    }

    address public protocolTreasury;
    address public oracleSigner;
    bytes32 public immutable DOMAIN_SEPARATOR;

    bytes32 public constant VERDICT_TYPEHASH = keccak256(
        "VerdictAttestation(bytes32 marketId,uint8 verdict,address decisiveWhistleblower,address[] jurors,uint256 timestamp,uint256 nonce)"
    );

    mapping(bytes32 => Market) public markets;
    mapping(bytes32 => mapping(address => mapping(uint8 => uint256))) public stakes;
    mapping(bytes32 => mapping(address => bool)) public hasClaimed;
    mapping(bytes32 => bool) public usedNonces;

    event MarketCreated(bytes32 indexed marketId, string claimText, address indexed creator, uint256 initialStake, uint8 outcome);
    event StakePlaced(bytes32 indexed marketId, address indexed staker, uint8 outcome, uint256 amount);
    event MarketSettled(bytes32 indexed marketId, Outcome finalVerdict, uint256 evidenceBounty, uint256 jurorPool);
    event PayoutClaimed(bytes32 indexed marketId, address indexed claimant, uint256 amount);

    constructor(address _protocolTreasury, address _oracleSigner) {
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

    function createMarket(string memory claimText, uint8 initialOutcome) external payable returns (bytes32) {
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

    function placeStake(bytes32 marketId, uint8 outcome) external payable {
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
     * @notice Settles market using EIP-712 signed oracle attestation and applies losing pool slashing waterfall.
     */
    function settleMarket(
        bytes32 marketId,
        uint8 verdict,
        address decisiveWhistleblower,
        address[] calldata jurors,
        uint256 timestamp,
        uint256 nonce,
        bytes calldata signature
    ) external {
        Market storage m = markets[marketId];
        require(m.status == MarketStatus.ACTIVE, "Market not active");
        require(verdict <= uint8(Outcome.NEED_CONTEXT), "Invalid verdict");
        require(!usedNonces[bytes32(nonce)], "Nonce already used");
        require(block.timestamp <= timestamp + 7 days, "Attestation expired");

        // Verify EIP-712 Signature
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
        m.status = MarketStatus.SETTLED;
        m.finalVerdict = Outcome(verdict);
        m.decisiveWhistleblower = decisiveWhistleblower;
        m.participatingJurors = jurors;

        // Execute Slashed Pool Waterfall:
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

        // Send protocol fee
        if (protoFee > 0) {
            (bool success, ) = protocolTreasury.call{value: protoFee}("");
            require(success, "Protocol fee transfer failed");
        }

        emit MarketSettled(marketId, m.finalVerdict, evidenceBounty, jurorPool);
    }

    /**
     * @notice Claim winning wager payout, whistleblower bounty, or juror deliberation fee.
     */
    function claimPayout(bytes32 marketId) external {
        Market storage m = markets[marketId];
        require(m.status == MarketStatus.SETTLED, "Market not settled");
        require(!hasClaimed[marketId][msg.sender], "Already claimed");

        uint256 payout = 0;

        // 1. Whistleblower 15% Bounty
        if (msg.sender == m.decisiveWhistleblower && m.evidenceBounty > 0) {
            payout += m.evidenceBounty;
        }

        // 2. Juror 5% Quorum Pool Share
        if (m.jurorQuorumPool > 0 && m.participatingJurors.length > 0) {
            for (uint256 i = 0; i < m.participatingJurors.length; i++) {
                if (m.participatingJurors[i] == msg.sender) {
                    payout += m.jurorQuorumPool / m.participatingJurors.length;
                    break;
                }
            }
        }

        // 3. Winning Staker Yield (Pro-rata share of distributable pool)
        uint8 winningOutcome = uint8(m.finalVerdict);
        uint256 userStake = stakes[marketId][msg.sender][winningOutcome];
        uint256 winningPool = m.outcomePools[winningOutcome];

        if (userStake > 0 && winningPool > 0) {
            uint256 stakerYield = (userStake * m.distributablePool) / winningPool;
            payout += stakerYield;
        }

        require(payout > 0, "No payout available");
        hasClaimed[marketId][msg.sender] = true;

        (bool success, ) = msg.sender.call{value: payout}("");
        require(success, "Payout transfer failed");

        emit PayoutClaimed(marketId, msg.sender, payout);
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
}
