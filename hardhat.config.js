// require("@nomicfoundation/hardhat-toolbox");
// require("dotenv").config();

// module.exports = {
//   solidity: {
//     version: "0.8.20",
//     settings: {
//       optimizer: {
//         enabled: true,
//         runs: 200,
//         },
//         viaIR: true,
//     },
//   },
//   networks: {
//     hardhat: {
//       hardfork: "cancun",
//       forking: {
//         url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
//         // blockNumber: 25823499, // Fork at simulation block
//       },
//       chainId: 84532,
//       accounts: {
//         mnemonic: "test test test test test test test test test test test junk",
//         count: 10,
//       },
//     },
//     baseSepolia: {
//       url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
//       accounts: [
//         process.env.PRIVATE_KEY_1,
//         process.env.PRIVATE_KEY_2,
//         process.env.PRIVATE_KEY_3,
//         process.env.PRIVATE_KEY_4,
//       ].filter((key) => key),
//       chainId: 84532,
//     },
//   },
//   etherscan: {
//     apiKey: {
//       baseSepolia: process.env.BASESCAN_API_KEY || "",
//     },
//     customChains: [
//       {
//         network: "baseSepolia",
//         chainId: 84532,
//         urls: {
//           apiURL: "https://api-sepolia.basescan.org/api",
//           browserURL: "https://sepolia.basescan.org",
//         },
//       },
//     ],
//   },
// };



require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      forking: {
        url: process.env.BASE_SEPOLIA_RPC_URL || "https://base-sepolia.g.alchemy.com/v2/your_alchemy_key",
        blockNumber: 12845678, // Recent block, adjust to latest - 100
      },
      chainId: 84532,
      accounts: {
        mnemonic: "test test test test test test test test test test test junk",
        count: 10,
      },
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://base-sepolia.g.alchemy.com/v2/your_alchemy_key",
      accounts: [
        process.env.PRIVATE_KEY,
        process.env.PRIVATE_KEY1,
        process.env.PRIVATE_KEY2,
        process.env.PRIVATE_KEY3,
        process.env.BACKENDSIGNERPRIVATEKEY,
      ].filter(Boolean),
      chainId: 84532,
    },
  },
  etherscan: {
    apiKey: {
      baseSepolia: process.env.BASESCAN_API_KEY || "your_basescan_api_key",
    },
    customChains: [
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
    ],
  },
};