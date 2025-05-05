const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DTAIOCStaking", function () {
  let DTAIOCToken, DTAIOCStaking, token, staking, owner, gameContract, platform, player1, player2, player3, player4, creator;
  const stakeAmount = ethers.parseEther("10");

  beforeEach(async function () {
    [owner, gameContract, platform, player1, player2, player3, player4, creator] = await ethers.getSigners();

    // Deploy DTAIOCToken
    DTAIOCToken = await ethers.getContractFactory("DTAIOCToken");
    token = await DTAIOCToken.deploy();
    await token.waitForDeployment();

    // Deploy DTAIOCStaking
    DTAIOCStaking = await ethers.getContractFactory("DTAIOCStaking");
    staking = await DTAIOCStaking.deploy(token.target, platform.address);
    await staking.waitForDeployment();
    await staking.setGameContract(gameContract.address);

    // Mint tokens for players
    await token.connect(player1).mint(stakeAmount);
    await token.connect(player2).mint(stakeAmount);
    await token.connect(player3).mint(stakeAmount);
    await token.connect(player4).mint(stakeAmount);
    await token.connect(player1).approve(staking.target, stakeAmount);
    await token.connect(player2).approve(staking.target, stakeAmount);
    await token.connect(player3).approve(staking.target, stakeAmount);
    await token.connect(player4).approve(staking.target, stakeAmount);
  });

  it("Should have correct initial setup", async function () {
    expect(await staking.token()).to.equal(token.target);
    expect(await staking.platformAddress()).to.equal(platform.address);
    expect(await staking.gameContract()).to.equal(gameContract.address);
    expect(await staking.stakingPaused()).to.equal(false);
    expect(await staking.owner()).to.equal(owner.address);
  });

  it("Should allow game contract to stake tokens", async function () {
    const gameId = 1;
    await staking.connect(gameContract).stake(gameId, player1.address, stakeAmount);
    expect(await staking.playerStakes(gameId, player1.address)).to.equal(stakeAmount);
    expect(await staking.totalStakes(gameId)).to.equal(stakeAmount);
    expect(await token.balanceOf(staking.target)).to.equal(stakeAmount);
    expect(await token.balanceOf(player1.address)).to.equal(0);
  });

  it("Should revert staking by non-game contract", async function () {
    await expect(
      staking.connect(player1).stake(1, player1.address, stakeAmount)
    ).to.be.revertedWith("Only game contract can call");
  });

  it("Should revert staking when paused", async function () {
    await staking.pauseStaking();
    await expect(
      staking.connect(gameContract).stake(1, player1.address, stakeAmount)
    ).to.be.revertedWith("Staking is paused");
  });

  it("Should revert staking with zero amount", async function () {
    await expect(
      staking.connect(gameContract).stake(1, player1.address, 0)
    ).to.be.revertedWith("Amount must be greater than 0");
  });

  it("Should process refunds correctly", async function () {
    const gameId = 1;

    // Stage 1: 0% refund (player1)
    await staking.connect(gameContract).stake(gameId, player1.address, stakeAmount);
    await staking.connect(gameContract).refund(gameId, player1.address, 1);
    expect(await staking.playerStakes(gameId, player1.address)).to.equal(0);
    expect(await staking.forfeitedStakes(gameId)).to.equal(stakeAmount);
    expect(await token.balanceOf(player1.address)).to.equal(0);

    // Stage 2: 30% refund (player2)
    await staking.connect(gameContract).stake(gameId, player2.address, stakeAmount);
    await staking.connect(gameContract).refund(gameId, player2.address, 2);
    expect(await token.balanceOf(player2.address)).to.equal(ethers.parseEther("3"));
    expect(await staking.forfeitedStakes(gameId)).to.equal(ethers.parseEther("17"));

    // Stage 3: 70% refund (player3)
    await staking.connect(gameContract).stake(gameId, player3.address, stakeAmount);
    await staking.connect(gameContract).refund(gameId, player3.address, 3);
    expect(await token.balanceOf(player3.address)).to.equal(ethers.parseEther("7"));
    expect(await staking.forfeitedStakes(gameId)).to.equal(ethers.parseEther("20"));

    // Stage 4: 100% refund (player4)
    await staking.connect(gameContract).stake(gameId, player4.address, stakeAmount);
    await staking.connect(gameContract).refund(gameId, player4.address, 4);
    expect(await token.balanceOf(player4.address)).to.equal(ethers.parseEther("10"));
    expect(await staking.forfeitedStakes(gameId)).to.equal(ethers.parseEther("20"));
  });

  it("Should revert refund with invalid stage", async function () {
    const gameId = 1;
    await staking.connect(gameContract).stake(gameId, player1.address, stakeAmount);
    await expect(
      staking.connect(gameContract).refund(gameId, player1.address, 5)
    ).to.be.revertedWith("Invalid stage");
  });

  it("Should revert refund with no stake", async function () {
    await expect(
      staking.connect(gameContract).refund(1, player1.address, 1)
    ).to.be.revertedWith("No stake found");
  });

  it("Should distribute rewards correctly", async function () {
    const gameId = 1;
    await staking.connect(gameContract).stake(gameId, player1.address, stakeAmount);
    await staking.connect(gameContract).refund(gameId, player1.address, 1); // Forfeits 10 tokens

    const winners = [player2.address, player2.address, player2.address];
    await staking.connect(gameContract).distributeRewards(gameId, creator.address, winners);

    // Forfeited: 10 tokens
    // Creator: 20% = 2 tokens
    // Platform: 20% = 2 tokens
    // Winners: 60% = 6 tokens (2 per winner)
    expect(await token.balanceOf(creator.address)).to.equal(ethers.parseEther("2"));
    expect(await token.balanceOf(platform.address)).to.equal(ethers.parseEther("2"));
    expect(await token.balanceOf(player2.address)).to.equal(ethers.parseEther("16")); // 10 + 6
    expect(await staking.forfeitedStakes(gameId)).to.equal(0);
    expect(await staking.totalStakes(gameId)).to.equal(0);
  });

  it("Should revert distributeRewards with invalid winners length", async function () {
    const gameId = 1;
    await staking.connect(gameContract).stake(gameId, player1.address, stakeAmount);
    await staking.connect(gameContract).refund(gameId, player1.address, 1);

    await expect(
      staking.connect(gameContract).distributeRewards(gameId, creator.address, [player2.address])
    ).to.be.revertedWith("Must have 3 winners");
  });

  it("Should revert distributeRewards with no forfeited stakes", async function () {
    await expect(
      staking.connect(gameContract).distributeRewards(1, creator.address, [player2.address, player2.address, player2.address])
    ).to.be.revertedWith("No forfeited stakes");
  });

  it("Should allow owner to pause and unpause staking", async function () {
    await staking.pauseStaking();
    expect(await staking.stakingPaused()).to.equal(true);
    await staking.unpauseStaking();
    expect(await staking.stakingPaused()).to.equal(false);
  });

  it("Should revert pause/unpause by non-owner", async function () {
    await expect(
      staking.connect(player1).pauseStaking()
    ).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount").withArgs(player1.address);
    await expect(
      staking.connect(player1).unpauseStaking()
    ).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount").withArgs(player1.address);
  });

  it("Should revert setGameContract with invalid address", async function () {
    await expect(
      staking.setGameContract(ethers.ZeroAddress)
    ).to.be.revertedWith("Invalid game contract address");
  });
});