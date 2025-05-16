# Sample Hardhat Project

This project demonstrates a basic Hardhat use case. It comes with a sample contract, a test for that contract, and a Hardhat Ignition module that deploys that contract.

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat ignition deploy ./ignition/modules/Lock.js

npx hardhat run scripts/deploy.js --network baseSepolia 
Connected to network: baseSepolia (chainId: 84532)
Deploying contracts with: 0x671b2d2b41AF93A1DBeb9E72e68E3Ce1C018B845
Gas options: { maxFeePerGas: 913421n, maxPriorityFeePerGas: 912673n }
MockSmartWallet deployed to: 0xBd5f62A3Ef61cC325C11001288704e4d0885b10a
Verifying MockSmartWallet at 0xBd5f62A3Ef61cC325C11001288704e4d0885b10a...
The contract 0xBd5f62A3Ef61cC325C11001288704e4d0885b10a has already been verified on the block explorer. If you're trying to verify a partially verified contract, please use the --force flag.
https://sepolia.basescan.org/address/0xBd5f62A3Ef61cC325C11001288704e4d0885b10a#code

MockSmartWallet verified successfully!
DTAIOCToken deployed to: 0x6A9cA2919e53Ea03e6137CA0336064B0287Ff1Fb
Verifying DTAIOCToken at 0x6A9cA2919e53Ea03e6137CA0336064B0287Ff1Fb...
Successfully submitted source code for contract
contracts/DTAIOCToken.sol:DTAIOCToken at 0x6A9cA2919e53Ea03e6137CA0336064B0287Ff1Fb
for verification on the block explorer. Waiting for verification result...

DTAIOCToken is already verified.
Deploying DTAIOCNFT with gameContract: 0x37706dAb5DA56EcCa562f4f26478d1C484f0A7fB
DTAIOCNFT contract object: BaseContract {
  target: '0x1528e8c709370cec11CB3e1913Cb4944F99E7750',
  interface: Interface {
    fragments: [
      [ConstructorFragment], [ErrorFragment],
      [ErrorFragment],       [ErrorFragment],
      [ErrorFragment],       [ErrorFragment],
      [ErrorFragment],       [ErrorFragment],
      [ErrorFragment],       [ErrorFragment],
      [ErrorFragment],       [ErrorFragment],
      [ErrorFragment],       [ErrorFragment],
      [ErrorFragment],       [EventFragment],
      [EventFragment],       [EventFragment],
      [EventFragment],       [EventFragment],
      [EventFragment],       [EventFragment],
      [EventFragment],       [FunctionFragment],
      [FunctionFragment],    [FunctionFragment],
      [FunctionFragment],    [FunctionFragment],
      [FunctionFragment],    [FunctionFragment],
      [FunctionFragment],    [FunctionFragment],
      [FunctionFragment],    [FunctionFragment],
      [FunctionFragment],    [FunctionFragment],
      [FunctionFragment],    [FunctionFragment],
      [FunctionFragment],    [FunctionFragment],
      [FunctionFragment],    [FunctionFragment]
    ],
    deploy: ConstructorFragment {
      type: 'constructor',
      inputs: [Array],
      payable: false,
      gas: null
    },
    fallback: null,
    receive: false
  },
  runner: HardhatEthersSigner {
    _gasLimit: undefined,
    address: '0x671b2d2b41AF93A1DBeb9E72e68E3Ce1C018B845',
    provider: HardhatEthersProvider {
      _hardhatProvider: [LazyInitializationProviderAdapter],
      _networkName: 'baseSepolia',
      _blockListeners: [],
      _transactionHashListeners: Map(0) {},
      _eventListeners: [],
      _isHardhatNetworkCached: false,
      _transactionHashPollingTimeout: undefined
    }
  },
  filters: {},
  fallback: null,
  [Symbol(_ethersInternal_contract)]: {}
}
DTAIOCNFT deployed to: 0x1528e8c709370cec11CB3e1913Cb4944F99E7750
Verifying DTAIOCNFT at 0x1528e8c709370cec11CB3e1913Cb4944F99E7750...
The contract 0x1528e8c709370cec11CB3e1913Cb4944F99E7750 has already been verified on the block explorer. If you're trying to verify a partially verified contract, please use the --force flag.
https://sepolia.basescan.org/address/0x1528e8c709370cec11CB3e1913Cb4944F99E7750#code

DTAIOCNFT verified successfully!
DTAIOCStaking deployed to: 0x33d7Dc84aa3115553fFa527f21bC521BCb505857
Verifying DTAIOCStaking at 0x33d7Dc84aa3115553fFa527f21bC521BCb505857...
Successfully submitted source code for contract
contracts/DTAIOCStaking.sol:DTAIOCStaking at 0x33d7Dc84aa3115553fFa527f21bC521BCb505857
for verification on the block explorer. Waiting for verification result...

Successfully verified contract DTAIOCStaking on the block explorer.
https://sepolia.basescan.org/address/0x33d7Dc84aa3115553fFa527f21bC521BCb505857#code

DTAIOCStaking verified successfully!
DTAIOCStaking owner: 0x671b2d2b41AF93A1DBeb9E72e68E3Ce1C018B845
MockBasenameResolver deployed to: 0x7F0eC684cA13d722366da9F3E8f276B68Dbf3B89
Verifying MockBasenameResolver at 0x7F0eC684cA13d722366da9F3E8f276B68Dbf3B89...
The contract 0x7F0eC684cA13d722366da9F3E8f276B68Dbf3B89 has already been verified on the block explorer. If you're trying to verify a partially verified contract, please use the --force flag.
https://sepolia.basescan.org/address/0x7F0eC684cA13d722366da9F3E8f276B68Dbf3B89#code

MockBasenameResolver verified successfully!
DTAIOCGame deployed to: 0x0B755c118eeCd43637cF9094246191B37DEeb821
Verifying DTAIOCGame at 0x0B755c118eeCd43637cF9094246191B37DEeb821...
Successfully submitted source code for contract
contracts/DTAIOCGame.sol:DTAIOCGame at 0x0B755c118eeCd43637cF9094246191B37DEeb821
for verification on the block explorer. Waiting for verification result...

Successfully verified contract DTAIOCGame on the block explorer.
https://sepolia.basescan.org/address/0x0B755c118eeCd43637cF9094246191B37DEeb821#code

DTAIOCGame verified successfully!
Setting DTAIOCNFT game contract to: 0x0B755c118eeCd43637cF9094246191B37DEeb821
DTAIOCNFT game contract updated successfully
DTAIOCPaymaster deployed to: 0x2C9FBD6894F8C28C1A723cE62513dFE1286D2866
Verifying DTAIOCPaymaster at 0x2C9FBD6894F8C28C1A723cE62513dFE1286D2866...
The contract 0x2C9FBD6894F8C28C1A723cE62513dFE1286D2866 has already been verified on the block explorer. If you're trying to verify a partially verified contract, please use the --force flag.
https://sepolia.basescan.org/address/0x2C9FBD6894F8C28C1A723cE62513dFE1286D2866#code

DTAIOCPaymaster verified successfully!
DTAIOCPaymaster owner: 0x671b2d2b41AF93A1DBeb9E72e68E3Ce1C018B845
Setting token, staking, and NFT contracts in Paymaster...
Token contract set to: 0x6A9cA2919e53Ea03e6137CA0336064B0287Ff1Fb
Staking contract set to: 0x33d7Dc84aa3115553fFa527f21bC521BCb505857
NFT contract set to: 0x1528e8c709370cec11CB3e1913Cb4944F99E7750
Configuring DTAIOCStaking...
DTAIOCStaking game contract set to: 0x0B755c118eeCd43637cF9094246191B37DEeb821
Funding Paymaster with 0.01 ETH...
ETH sent to Paymaster
Depositing to EntryPoint...
Paymaster deposited to EntryPoint
Update forkGameSimulation.js with:
tokenAddress: "0x6A9cA2919e53Ea03e6137CA0336064B0287Ff1Fb"
nftAddress: "0x1528e8c709370cec11CB3e1913Cb4944F99E7750"
stakingAddress: "0x33d7Dc84aa3115553fFa527f21bC521BCb505857"
resolverAddress: "0x7F0eC684cA13d722366da9F3E8f276B68Dbf3B89"
gameAddress: "0x0B755c118eeCd43637cF9094246191B37DEeb821"
entryPointAddress: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"
paymasterAddress: "0x2C9FBD6894F8C28C1A723cE62513dFE1286D2866"
smartWalletAddress: "0xBd5f62A3Ef61cC325C11001288704e4d0885b10a"
platformAddress: "0x37706dAb5DA56EcCa562f4f26478d1C484f0A7fB"
➜  DTAIOC-smartContract git:(main) ✗ 



////////
okenAddress: "0x6A9cA2919e53Ea03e6137CA0336064B0287Ff1Fb"
nftAddress: "0x1528e8c709370cec11CB3e1913Cb4944F99E7750"
stakingAddress: "0x33d7Dc84aa3115553fFa527f21bC521BCb505857"
resolverAddress: "0x7F0eC684cA13d722366da9F3E8f276B68Dbf3B89"
gameAddress: "0x0B755c118eeCd43637cF9094246191B37DEeb821"
entryPointAddress: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"
paymasterAddress: "0x2C9FBD6894F8C28C1A723cE62513dFE1286D2866"
smartWalletAddress: "0xBd5f62A3Ef61cC325C11001288704e4d0885b10a"
platformAddress: "0x37706dAb5DA56EcCa562f4f26478d1C484f0A7fB"