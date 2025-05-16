// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockSmartWallet {
    address public owner;
    uint256 public nonce;

    constructor(address _owner) {
        owner = _owner;
    }

    function execute(address target, bytes calldata data) external returns (bytes memory) {
        require(msg.sender == owner, "Only owner");
        (bool success, bytes memory result) = target.call(data);
        require(success, "Call failed");
        nonce++;
        return result;
    }

    function getNonce() external view returns (uint256) {
        return nonce;
    }

}