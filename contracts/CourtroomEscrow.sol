// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CourtroomEscrow
 * @notice 14-Day Cold Case Refund Escrow & 2x Challenge Retrial Bond Vault
 */
contract CourtroomEscrow {
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

    address public protocolTreasury;
    mapping(bytes32 => EscrowDocket) public dockets;
    mapping(bytes32 => mapping(address => uint256)) public deposits;
    mapping(bytes32 => mapping(address => bool)) public hasRefundClaimed;

    event DocketRegistered(bytes32 indexed docketId, address indexed creator, uint256 amount);
    event ColdCaseRefundTriggered(bytes32 indexed docketId, uint256 totalRefunded, uint256 protocolFee);
    event ChallengeBondFiled(bytes32 indexed docketId, address indexed challenger, uint256 bondAmount, string evidenceCID);
    event RefundClaimed(bytes32 indexed docketId, address indexed staker, uint256 refundAmount);

    constructor(address _protocolTreasury) {
        protocolTreasury = _protocolTreasury;
    }

    function registerDocket(bytes32 docketId) external payable {
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

    function addDeposit(bytes32 docketId) external payable {
        EscrowDocket storage d = dockets[docketId];
        require(d.createdAt > 0, "Docket does not exist");
        require(!d.isColdRefunded, "Docket is refunded");
        require(msg.value > 0, "Deposit > 0 required");

        d.totalDeposited += msg.value;
        d.lastActivityTime = block.timestamp;
        deposits[docketId][msg.sender] += msg.value;
    }

    /**
     * @notice Files a 2x challenge bond with fresh evidence CID to reopen an inactive docket.
     */
    function fileChallengeBond(bytes32 docketId, string calldata evidenceCID) external payable {
        EscrowDocket storage d = dockets[docketId];
        require(d.createdAt > 0, "Docket does not exist");
        require(!d.isColdRefunded, "Docket is cold refunded");
        require(!d.isChallenged, "Docket already challenged");

        // Requires 2x original creator deposit
        uint256 requiredBond = deposits[docketId][d.creator] * 2;
        require(msg.value >= requiredBond, "Insufficient 2x challenge bond");

        d.isChallenged = true;
        d.activeChallenger = msg.sender;
        d.challengeBond = msg.value;
        d.newEvidenceCID = evidenceCID;
        d.lastActivityTime = block.timestamp; // Reset 14-day inactivity timer

        emit ChallengeBondFiled(docketId, msg.sender, msg.value, evidenceCID);
    }

    /**
     * @notice Triggers 94% cold case refund if docket remains inactive for 14 days.
     */
    function triggerColdCaseRefund(bytes32 docketId) external {
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

    /**
     * @notice Claim 94% refund of user deposit.
     */
    function claimRefund(bytes32 docketId) external {
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
}
