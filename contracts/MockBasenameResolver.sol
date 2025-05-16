// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockBasenameResolver {
    mapping(bytes32 => address) private resolvedAddresses;
    mapping(address => string) public basenames;
    mapping(string => address) private twitterToAddress;
    mapping(address => string) public twitterUsernames;

    function namehash(bytes32 node) external pure returns (bytes32) {
        return node;
    }

    function resolve(bytes32 node) external view returns (address) {
        return resolvedAddresses[node];
    }

    function resolve(address wallet) external view returns (string memory) {
        return basenames[wallet];
    }

    function resolveTwitter(string calldata twitterUsername) external view returns (address) {
        return twitterToAddress[twitterUsername];
    }

    function getTwitterUsername(address wallet) external view returns (string memory) {
        return twitterUsernames[wallet];
    }

    function setResolvedAddress(bytes32 node, address addr) external {
        resolvedAddresses[node] = addr;
    }

    function setBasename(address wallet, string memory basename) external {
        basenames[wallet] = basename;
        resolvedAddresses[keccak256(abi.encodePacked(basename))] = wallet;
    }

    function setTwitterUsername(address wallet, string memory twitterUsername) external {
        twitterUsernames[wallet] = twitterUsername;
        twitterToAddress[twitterUsername] = wallet;
    }
}