// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IBasenameResolver {
    function namehash(bytes32 node) external pure returns (bytes32);
    function resolve(bytes32 node) external view returns (address);
    function resolve(address wallet) external view returns (string memory);
    function resolveTwitter(string calldata twitterUsername) external view returns (address);
    function getTwitterUsername(address wallet) external view returns (string memory);
}