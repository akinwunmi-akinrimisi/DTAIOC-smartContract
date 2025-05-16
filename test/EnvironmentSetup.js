const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Environment Setup", function () {
  it("Should have Hardhat environment configured", async function () {
    expect(ethers).to.not.be.undefined;
    expect(ethers.provider).to.not.be.undefined;
  });

  it("Should have required dependencies installed", async function () {
    expect(() => require("@alchemy/aa-core")).to.not.throw();
    expect(() => require("@openzeppelin/contracts")).to.not.throw();
  });

  it("Should connect to Base Sepolia network", async function () {
    if (hre.network.name === "hardhat") {
      this.skip();
    }

    const provider = ethers.provider;
    const network = await provider.getNetwork();
    expect(network.chainId).to.equal(84532); // Base Sepolia chain ID
  });

  it("Should have valid RPC URL configured", async function () {
    if (hre.network.name === "hardhat") {
      this.skip();
    }

    const rpcUrl = hre.config.networks.baseSepolia.url;
    expect(rpcUrl).to.match(/(base\.org|alchemy\.com)/);
    expect(rpcUrl).to.not.include("BASE_SEPOLIA_RPC_URL");
  });

  it("Should have test wallet configured", async function () {
    if (hre.network.name === "hardhat") {
      this.skip();
    }

    const accounts = hre.config.networks.baseSepolia.accounts;
    expect(accounts).to.be.an("array").that.is.not.empty;
    expect(accounts[0]).to.not.equal("PRIVATE_KEY");
  });

  it("Should generate storage layout", async function () {
    const TestContract = await ethers.getContractFactory("TestContract");
    const testContract = await TestContract.deploy();
    await testContract.waitForDeployment(); // ethers v6 compatibility

    const artifact = await hre.artifacts.readArtifact("TestContract");
    expect(artifact.storageLayout).to.not.be.undefined;
    expect(artifact.storageLayout.storage).to.be.an("array");
  });
});