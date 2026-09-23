// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./proxy/Initializable.sol";
import "./proxy/UUPSUpgradeable.sol";

/**
 * @title CourtroomEscrow
 * @notice Upgradeable 14-Day Cold Case Refund Escrow & 2x Challenge Retrial Bond Vault (UUPS / ERC-1967)
 */
contract CourtroomEscrow is Initializable, UUPSUpgradeable {
    uint256 public constant INACTIVITY_PERIOD = 14 days;
    uint256 public constant REFUND_PERCENTAGE = 94; // 94% returned to stakers
    uint256 public constant PROTOCOL_REFUND_FEE = 6; // 6% protocol maintenance fee

    struct EscrowDocket {
        bytes32 docketId;
        address creator;
        uint256 createdAt;
        uint256 lastActivityTime;
        uint256 totalDeposited;
        bool isColdRefunded;
        bool isChallenged;
        address activeChallenger;
        uint256 challengeBond;
        string newEvidenceCID;
    }

    address public owner;
    address public protocolTreasury;
    bool private _locked;

    mapping(bytes32 => EscrowDocket) public dockets;
    mapping(bytes32 => mapping(address => uint256)) public deposits;
    mapping(bytes32 => mapping(address => bool)) public hasRefundClaimed;

    event DocketRegistered(bytes32 indexed docketId, address indexed creator, uint256 amount);
    event ColdCaseRefundTriggered(bytes32 indexed docketId, uint256 totalRefunded, uint256 protocolFee);
    event ChallengeBondFiled(bytes32 indexed docketId, address indexed challenger, uint256 bondAmount, string evidenceCID);
    event ChallengeSettled(bytes32 indexed docketId, address indexed challenger, bool overturned, uint256 amount);
    event RefundClaimed(bytes32 indexed docketId, address indexed staker, uint256 refundAmount);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event ProtocolTreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

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
     * @notice Initializes the upgradeable CourtroomEscrow logic
     */
    function initialize(address _protocolTreasury) external initializer {
        require(_protocolTreasury != address(0), "Invalid treasury");
        owner = msg.sender;
        protocolTreasury = _protocolTreasury;
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

    function updateProtocolTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "New treasury is zero address");
        emit ProtocolTreasuryUpdated(protocolTreasury, newTreasury);
        protocolTreasury = newTreasury;
    }

    function registerDocket(bytes32 docketId) external payable nonReentrant {
        require(msg.value > 0, "Initial deposit required");
        require(dockets[docketId].createdAt == 0, "Docket already registered");

        EscrowDocket storage d = dockets[docketId];
        d.docketId = docketId;
        d.creator = msg.sender;
        d.createdAt = block.timestamp;
        d.lastActivityTime = block.timestamp;
        d.totalDeposited = msg.value;

        deposits[docketId][msg.sender] += msg.value;

        emit DocketRegistered(docketId, msg.sender, msg.value);
    }

    function addDeposit(bytes32 docketId) external payable nonReentrant {
        EscrowDocket storage d = dockets[docketId];
        require(d.createdAt > 0, "Docket does not exist");
        require(!d.isColdRefunded, "Docket is refunded");
        require(msg.value > 0, "Deposit > 0 required");

        d.totalDeposited += msg.value;
        d.lastActivityTime = block.timestamp;
        deposits[docketId][msg.sender] += msg.value;
    }

    function fileChallengeBond(bytes32 docketId, string calldata evidenceCID) external payable nonReentrant {
        EscrowDocket storage d = dockets[docketId];
        require(d.createdAt > 0, "Docket does not exist");
        require(!d.isColdRefunded, "Docket is cold refunded");
        require(!d.isChallenged, "Docket already challenged");

        uint256 requiredBond = deposits[docketId][d.creator] * 2;
        require(msg.value >= requiredBond, "Insufficient 2x challenge bond");

        d.isChallenged = true;
        d.activeChallenger = msg.sender;
        d.challengeBond = msg.value;
        d.newEvidenceCID = evidenceCID;
        d.lastActivityTime = block.timestamp;

        emit ChallengeBondFiled(docketId, msg.sender, msg.value, evidenceCID);
    }

    function settleChallenge(
        bytes32 docketId,
        bool overturned,
        address[] calldata jurors
    ) external onlyOwner nonReentrant {
        EscrowDocket storage d = dockets[docketId];
        require(d.isChallenged, "Docket not challenged");
        require(!d.isColdRefunded, "Docket is cold refunded");

        address challenger = d.activeChallenger;
        uint256 bond = d.challengeBond;

        d.isChallenged = false;
        d.activeChallenger = address(0);
        d.challengeBond = 0;
        d.lastActivityTime = block.timestamp;

        if (overturned) {
            uint256 reward = (d.totalDeposited * 20) / 100;
            if (reward > 0) {
                d.totalDeposited = d.totalDeposited > reward ? d.totalDeposited - reward : 0;
            }
            uint256 totalPayout = bond + reward;

            (bool success, ) = challenger.call{value: totalPayout}("");
            require(success, "Challenger payout failed");

            emit ChallengeSettled(docketId, challenger, true, totalPayout);
        } else {
            uint256 jurorShare = (bond * 50) / 100;
            uint256 treasuryShare = bond - jurorShare;

            if (jurors.length > 0 && jurorShare > 0) {
                uint256 perJuror = jurorShare / jurors.length;
                for (uint256 i = 0; i < jurors.length; i++) {
                    (bool s, ) = jurors[i].call{value: perJuror}("");
                    require(s, "Juror transfer failed");
                }
            } else {
                treasuryShare += jurorShare;
            }

            if (treasuryShare > 0) {
                (bool success, ) = protocolTreasury.call{value: treasuryShare}("");
                require(success, "Treasury transfer failed");
            }

            emit ChallengeSettled(docketId, challenger, false, bond);
        }
    }

    function triggerColdCaseRefund(bytes32 docketId) external nonReentrant {
        EscrowDocket storage d = dockets[docketId];
        require(d.createdAt > 0, "Docket does not exist");
        require(!d.isColdRefunded, "Already cold refunded");
        require(block.timestamp >= d.lastActivityTime + INACTIVITY_PERIOD, "Inactivity period not reached");

        d.isColdRefunded = true;
        uint256 total = d.totalDeposited;
        uint256 protoFee = (total * PROTOCOL_REFUND_FEE) / 100;

        if (protoFee > 0) {
            (bool success, ) = protocolTreasury.call{value: protoFee}("");
            require(success, "Protocol fee transfer failed");
        }

        emit ColdCaseRefundTriggered(docketId, total - protoFee, protoFee);
    }

    function claimRefund(bytes32 docketId) external nonReentrant {
        EscrowDocket storage d = dockets[docketId];
        require(d.isColdRefunded, "Docket not cold refunded");
        require(!hasRefundClaimed[docketId][msg.sender], "Already claimed refund");

        uint256 userDeposit = deposits[docketId][msg.sender];
        require(userDeposit > 0, "No deposit found");

        hasRefundClaimed[docketId][msg.sender] = true;
        uint256 refundAmount = (userDeposit * REFUND_PERCENTAGE) / 100;

        (bool success, ) = msg.sender.call{value: refundAmount}("");
        require(success, "Refund transfer failed");

        emit RefundClaimed(docketId, msg.sender, refundAmount);
    }

    // Storage gap for future upgrades
    uint256[48] private __gap;
}
