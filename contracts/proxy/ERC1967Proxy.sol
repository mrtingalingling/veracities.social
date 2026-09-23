// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ERC1967Proxy
 * @dev Canonical delegating proxy based on EIP-1967.
 * Stores the implementation address at slot keccak256('eip1967.proxy.implementation') - 1.
 */
contract ERC1967Proxy {
    /**
     * @dev Storage slot with the address of the current implementation.
     * bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)
     */
    bytes32 internal constant _IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    event Upgraded(address indexed implementation);

    error ImplementationZeroAddress();
    error InitializationFailed();

    constructor(address _logic, bytes memory _data) payable {
        if (_logic == address(0)) revert ImplementationZeroAddress();
        _setImplementation(_logic);
        emit Upgraded(_logic);
        if (_data.length > 0) {
            (bool success, bytes memory returndata) = _logic.delegatecall(_data);
            if (!success) {
                if (returndata.length > 0) {
                    assembly {
                        let returndata_size := mload(returndata)
                        revert(add(32, returndata), returndata_size)
                    }
                } else {
                    revert InitializationFailed();
                }
            }
        }
    }

    function _getImplementation() internal view returns (address impl) {
        bytes32 slot = _IMPLEMENTATION_SLOT;
        assembly {
            impl := sload(slot)
        }
    }

    function _setImplementation(address newImplementation) internal {
        bytes32 slot = _IMPLEMENTATION_SLOT;
        assembly {
            sstore(slot, newImplementation)
        }
    }

    function implementation() external view returns (address) {
        return _getImplementation();
    }

    fallback() external payable virtual {
        _delegate(_getImplementation());
    }

    receive() external payable virtual {
        _delegate(_getImplementation());
    }

    function _delegate(address impl) internal virtual {
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 {
                revert(0, returndatasize())
            }
            default {
                return(0, returndatasize())
            }
        }
    }
}
