// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./proxy/Initializable.sol";
import "./proxy/UUPSUpgradeable.sol";
import "./interfaces/IDAOFrameworks.sol";

/**
 * @title EpistemicCrsManager
 * @notice Adaptation of the Vera / Veracities Epistemic Tier & Groundedness reputation
 * system on top of the EnDAOsment modular governance framework (ICrsManager).
 *
 * Implements historical block-checkpointed reputation scores
 * for Stage 1 Approval and Stage 2 Quadratic voting snapshots.
 *
 * Epistemic Tier mappings to CRS:
 * - NOVICE:      1 * 10^18 CRS  (100 quadratic voting credits)
 * - CONTRIBUTOR: 5 * 10^18 CRS  (500 quadratic voting credits)
 * - ARBITER:    15 * 10^18 CRS  (1,500 quadratic voting credits)
 * - SAGE:       30 * 10^18 CRS  (3,000 quadratic voting credits)
 */
contract EpistemicCrsManager is Initializable, UUPSUpgradeable, ICrsManager {
    enum EpistemicTier {
        NOVICE,
        CONTRIBUTOR,
        ARBITER,
        SAGE
    }

    struct Checkpoint {
        uint48 timepoint;
        uint208 value;
    }

    uint256 public constant NOVICE_CRS = 1 ether;
    uint256 public constant CONTRIBUTOR_CRS = 5 ether;
    uint256 public constant ARBITER_CRS = 15 ether;
    uint256 public constant SAGE_CRS = 30 ether;

    address public owner;
    address public oracle;

    // Checkpoints per token ID per account: tokenId => account => Checkpoint[]
    mapping(uint256 => mapping(address => Checkpoint[])) private _checkpoints;

    // Direct lookup for latest Epistemic Tier: tokenId => account => EpistemicTier
    mapping(uint256 => mapping(address => EpistemicTier)) public memberTiers;

    event EpistemicTierUpdated(
        address indexed account,
        uint256 indexed tokenId,
        EpistemicTier indexed tier,
        uint256 crsScore
    );
    event CrsScoreUpdated(
        address indexed account,
        uint256 indexed tokenId,
        uint256 crsScore
    );
    event OracleUpdated(address indexed newOracle);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error ZeroAddress();
    error Unauthorized();
    error MismatchedArrays();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyOracleOrOwner() {
        if (msg.sender != oracle && msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function initialize(address defaultAdmin, address _oracle) external initializer {
        if (defaultAdmin == address(0)) revert ZeroAddress();
        owner = defaultAdmin;
        oracle = _oracle != address(0) ? _oracle : defaultAdmin;
        emit OwnershipTransferred(address(0), defaultAdmin);
        emit OracleUpdated(oracle);
    }

    function setOracle(address newOracle) external onlyOwner {
        if (newOracle == address(0)) revert ZeroAddress();
        oracle = newOracle;
        emit OracleUpdated(newOracle);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function tierToCrs(EpistemicTier tier) public pure returns (uint256) {
        if (tier == EpistemicTier.SAGE) return SAGE_CRS;
        if (tier == EpistemicTier.ARBITER) return ARBITER_CRS;
        if (tier == EpistemicTier.CONTRIBUTOR) return CONTRIBUTOR_CRS;
        return NOVICE_CRS;
    }

    function setEpistemicTier(
        address account,
        uint256 tokenId,
        EpistemicTier tier
    ) external onlyOracleOrOwner {
        if (account == address(0)) revert ZeroAddress();

        memberTiers[tokenId][account] = tier;
        uint256 score = tierToCrs(tier);

        uint48 timepoint = clock();
        _pushCheckpoint(tokenId, account, timepoint, uint208(score));

        emit EpistemicTierUpdated(account, tokenId, tier, score);
    }

    function setRawCrs(
        address account,
        uint256 tokenId,
        uint256 score
    ) external onlyOracleOrOwner {
        if (account == address(0)) revert ZeroAddress();

        uint48 timepoint = clock();
        _pushCheckpoint(tokenId, account, timepoint, uint208(score));

        emit CrsScoreUpdated(account, tokenId, score);
    }

    function batchSetEpistemicTiers(
        address[] calldata accounts,
        uint256 tokenId,
        EpistemicTier[] calldata tiers
    ) external onlyOracleOrOwner {
        if (accounts.length != tiers.length) revert MismatchedArrays();
        uint48 timepoint = clock();

        for (uint256 i = 0; i < accounts.length; ++i) {
            address account = accounts[i];
            if (account == address(0)) revert ZeroAddress();

            EpistemicTier tier = tiers[i];
            memberTiers[tokenId][account] = tier;
            uint256 score = tierToCrs(tier);

            _pushCheckpoint(tokenId, account, timepoint, uint208(score));
            emit EpistemicTierUpdated(account, tokenId, tier, score);
        }
    }

    function getCrs(address account, uint256 tokenId) external view override returns (uint256) {
        Checkpoint[] storage ckpts = _checkpoints[tokenId][account];
        if (ckpts.length == 0) return 0;
        return ckpts[ckpts.length - 1].value;
    }

    function getPastCrs(
        address account,
        uint256 tokenId,
        uint256 timepoint
    ) external view override returns (uint256) {
        Checkpoint[] storage ckpts = _checkpoints[tokenId][account];
        uint256 len = ckpts.length;
        if (len == 0) return 0;

        if (timepoint >= clock()) {
            return ckpts[len - 1].value;
        }

        // Binary search for upper lookup
        uint256 low = 0;
        uint256 high = len;

        while (low < high) {
            uint256 mid = (low + high) / 2;
            if (ckpts[mid].timepoint > timepoint) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }

        return low == 0 ? 0 : ckpts[low - 1].value;
    }

    function clock() public view virtual returns (uint48) {
        return uint48(block.number);
    }

    function _pushCheckpoint(uint256 tokenId, address account, uint48 timepoint, uint208 value) internal {
        Checkpoint[] storage ckpts = _checkpoints[tokenId][account];
        uint256 len = ckpts.length;
        if (len > 0 && ckpts[len - 1].timepoint == timepoint) {
            ckpts[len - 1].value = value;
        } else {
            ckpts.push(Checkpoint({timepoint: timepoint, value: value}));
        }
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    uint256[48] private __gap;
}
