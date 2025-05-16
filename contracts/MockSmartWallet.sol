// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockSmartWallet {
    error OnlyOwner();
    error CallFailed();

    address public owner;
    uint256 public nonce;

    event Executed(address indexed target, bytes data, bool success, bytes result);
    event SignatureVerified(bytes32 indexed hash, bytes signature, bool valid);

    constructor(address _owner) {
        if (_owner == address(0)) revert OnlyOwner();
        owner = _owner;
    }

    function execute(address target, bytes calldata data) external returns (bytes memory) {
        if (msg.sender != owner) revert OnlyOwner();
        (bool success, bytes memory result) = target.call(data);
        if (!success) revert CallFailed();
        nonce++;
        emit Executed(target, data, success, result);
        return result;
    }

    function verifySignature(
        // bytes32 hash, // Unused, commented out
        // bytes memory signature // Unused, commented out
    ) external pure returns (bool) {
        // Mock: Always return true for testing
        // In production, implement EIP-1271 or ECDSA validation
        // emit SignatureVerified(hash, signature, true); // Cannot emit in pure function
        return true;
    }

    function getNonce() external view returns (uint256) {
        return nonce;
    }
}