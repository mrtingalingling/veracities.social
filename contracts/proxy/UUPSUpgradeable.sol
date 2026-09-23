// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title UUPSUpgradeable
 * @dev An upgradeability mechanism designed for UUPS (Universal Upgradeable Proxy Standard) proxies.
 * The upgrade logic is contained within the implementation contract itself,
 * secured by the `_authorizeUpgrade` hook.
 */
abstract contract UUPSUpgradeable {
    bytes32 internal constant _IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    event Upgraded(address indexed implementation);

    error ImplementationZeroAddress();
    error ImplementationNotAContract();
    error UpgradeCallFailed();

    /**
     * @dev Upgrades the proxy to a new implementation and optionally calls a function on it.
     */
    function upgradeToAndCall(address newImplementation, bytes memory data) external payable virtual {
        _authorizeUpgrade(newImplementation);
        _upgradeToAndCallUUPS(newImplementation, data);
    }

    /**
     * @dev Function that should revert when `msg.sender` is not authorized to upgrade the contract.
     * Called by {upgradeToAndCall}.
     */
    function _authorizeUpgrade(address newImplementation) internal virtual;

    function _upgradeToAndCallUUPS(address newImplementation, bytes memory data) internal {
        if (newImplementation == address(0)) revert ImplementationZeroAddress();
        if (newImplementation.code.length == 0) revert ImplementationNotAContract();

        _setImplementation(newImplementation);
        emit Upgraded(newImplementation);

        if (data.length > 0) {
            (bool success, bytes memory returndata) = newImplementation.delegatecall(data);
            if (!success) {
                if (returndata.length > 0) {
                    assembly {
                        let returndata_size := mload(returndata)
                        revert(add(32, returndata), returndata_size)
                    }
                } else {
                    revert UpgradeCallFailed();
                }
            }
        }
    }

    function _setImplementation(address newImplementation) internal {
        bytes32 slot = _IMPLEMENTATION_SLOT;
        assembly {
            sstore(slot, newImplementation)
        }
    }

    function proxiableUUID() external view virtual returns (bytes32) {
        return _IMPLEMENTATION_SLOT;
    }
}
