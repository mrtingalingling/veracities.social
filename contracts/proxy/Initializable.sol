// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Initializable
 * @dev Helper contract to aid in writing upgradeable contracts or any kind of contract
 * that will be deployed with a proxy and initialized rather than constructed.
 */
abstract contract Initializable {
    uint64 private _initialized;
    bool private _initializing;

    event Initialized(uint64 version);

    error InvalidInitialization();
    error NotInitializing();

    modifier initializer() {
        bool isTopLevelCall = !_initializing;
        uint64 initialized = _initialized;
        if ((!isTopLevelCall || initialized >= 1) && (address(this).code.length != 0 || initialized != 1)) {
            revert InvalidInitialization();
        }
        _initialized = 1;
        if (isTopLevelCall) {
            _initializing = true;
        }
        _;
        if (isTopLevelCall) {
            _initializing = false;
            emit Initialized(1);
        }
    }

    modifier reinitializer(uint64 version) {
        if (_initializing || _initialized >= version) {
            revert InvalidInitialization();
        }
        _initialized = version;
        _initializing = true;
        _;
        _initializing = false;
        emit Initialized(version);
    }

    modifier onlyInitializing() {
        if (!_initializing) {
            revert NotInitializing();
        }
        _;
    }

    function _disableInitializers() internal virtual {
        if (_initializing) {
            revert InvalidInitialization();
        }
        if (_initialized != type(uint64).max) {
            _initialized = type(uint64).max;
            emit Initialized(type(uint64).max);
        }
    }

    function _getInitializedVersion() internal view returns (uint64) {
        return _initialized;
    }

    function _isInitializing() internal view returns (bool) {
        return _initializing;
    }
}
