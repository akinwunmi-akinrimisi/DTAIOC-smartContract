const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DTAIOCToken", function () {
  let DTAIOCToken, token, owner, addr1, addr2, addr3;

  beforeEach(async function () {
    [owner, addr1, addr2, addr3] = await ethers.getSigners();
    DTAIOCToken = await ethers.getContractFactory("DTAIOCToken");
    token = await DTAIOCToken.deploy();
    await token.waitForDeployment();
  });

  it("Should have correct initial setup", async function () {
    expect(await token.name()).to.equal("DTriviaAIOnChain Token");
    expect(await token.symbol()).to.equal("DTAIOC");
    expect(await token.totalSupply()).to.equal(0);
    expect(await token.MAX_SUPPLY()).to.equal(ethers.parseEther("5000000"));
    expect(await token.MAX_MINT_PER_WALLET()).to.equal(ethers.parseEther("30"));
    expect(await token.MIN_BALANCE_FOR_MINT()).to.equal(ethers.parseEther("10"));
    expect(await token.mintingPaused()).to.equal(false);
    expect(await token.owner()).to.equal(owner.address);
  });

  it("Should allow minting within limits", async function () {
    await token.connect(addr1).mint(ethers.parseEther("20"));
    expect(await token.balanceOf(addr1.address)).to.equal(ethers.parseEther("20"));
    expect(await token.mintedAmount(addr1.address)).to.equal(ethers.parseEther("20"));
    expect(await token.totalMinted()).to.equal(ethers.parseEther("20"));
  });

  it("Should allow additional minting if balance < 10 tokens", async function () {
    await token.connect(addr1).mint(ethers.parseEther("5"));
    expect(await token.balanceOf(addr1.address)).to.equal(ethers.parseEther("5"));

    // Spend some tokens to reduce balance below 10
    await token.connect(addr1).transfer(addr2.address, ethers.parseEther("2"));
    expect(await token.balanceOf(addr1.address)).to.equal(ethers.parseEther("3"));

    // Mint again (total minted = 5 + 5 = 10)
    await token.connect(addr1).mint(ethers.parseEther("5"));
    expect(await token.balanceOf(addr1.address)).to.equal(ethers.parseEther("8"));
    expect(await token.mintedAmount(addr1.address)).to.equal(ethers.parseEther("10"));
  });

  it("Should revert minting if paused", async function () {
    await token.pauseMinting();
    await expect(token.connect(addr1).mint(ethers.parseEther("10")))
      .to.be.revertedWith("Minting is paused");
  });

  it("Should revert minting if amount is 0", async function () {
    await expect(token.connect(addr1).mint(0))
      .to.be.revertedWith("Amount must be greater than 0");
  });

  // it("Should revert minting if exceeds max supply", async function () {
  //   // Mint 4,999,970 tokens across multiple wallets to approach max supply
  //   const maxMintPerWallet = ethers.parseEther("30");
  //   const numWallets = 166666; // Approx 5M / 30
  //   for (let i = 0; i < numWallets - 1; i++) {
  //     const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
  //     await owner.sendTransaction({
  //       to: wallet.address,
  //       value: ethers.parseEther("0.1")
  //     });
  //     await token.connect(wallet).mint(maxMintPerWallet);
  //   }
  //   // Mint remaining to reach 5M - 1 token
  //   await token.connect(addr1).mint(ethers.parseEther("29.97"));
  //   expect(await token.totalMinted()).to.be.closeTo(ethers.parseEther("4999999.99"), ethers.parseEther("0.01"));

  //   // Try to mint 30 tokens to exceed max supply
  //   await expect(token.connect(addr2).mint(ethers.parseEther("30")))
  //     .to.be.revertedWith("Exceeds max supply");
  // });

  it("Should revert minting if exceeds per-wallet cap", async function () {
    await token.connect(addr1).mint(ethers.parseEther("30"));
    await expect(token.connect(addr1).mint(ethers.parseEther("1")))
      .to.be.revertedWith("Exceeds max mint per wallet");
  });

  it("Should revert minting if balance >= 10 tokens", async function () {
    await token.connect(addr1).mint(ethers.parseEther("15"));
    await expect(token.connect(addr1).mint(ethers.parseEther("5")))
      .to.be.revertedWith("Balance must be below 10 tokens");
  });

  it("Should allow owner to pause and unpause minting", async function () {
    await token.pauseMinting();
    expect(await token.mintingPaused()).to.equal(true);
    await token.unpauseMinting();
    expect(await token.mintingPaused()).to.equal(false);
    await token.connect(addr1).mint(ethers.parseEther("10")); // Should succeed
  });

  it("Should revert pause/unpause by non-owner", async function () {
    await expect(token.connect(addr1).pauseMinting())
      .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
      .withArgs(addr1.address);
    await expect(token.connect(addr1).unpauseMinting())
      .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount")
      .withArgs(addr1.address);
  });
});