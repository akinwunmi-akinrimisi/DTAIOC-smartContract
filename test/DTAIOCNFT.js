const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DTAIOCNFT", function () {
  let DTAIOCNFT, nft, owner, gameContract, addr1, addr2;
  const TOKEN_URI = "ipfs://bafybeigofcndglhgthcq6qrmj3nuc3ahn7diovjxytuifk54t5svhufe4i";

  beforeEach(async function () {
    [owner, gameContract, addr1, addr2] = await ethers.getSigners();
    DTAIOCNFT = await ethers.getContractFactory("DTAIOCNFT");
    nft = await DTAIOCNFT.deploy();
    await nft.waitForDeployment();
    await nft.setGameContract(gameContract.address);
  });

  it("Should have correct initial setup", async function () {
    expect(await nft.name()).to.equal("DTriviaAIOnChain NFT");
    expect(await nft.symbol()).to.equal("DTAIOCNFT");
    expect(await nft.owner()).to.equal(owner.address);
    expect(await nft.gameContract()).to.equal(gameContract.address);
  });

  it("Should allow game contract to mint NFT with provided metadata", async function () {
    const gameId = 1;
    const rank = 1;
    const tx = await nft.connect(gameContract).mintNFT(addr1.address, gameId, rank, TOKEN_URI);
    const receipt = await tx.wait();
    const tokenId = receipt.logs[0].args.tokenId;

    expect(await nft.ownerOf(tokenId)).to.equal(addr1.address);
    expect(await nft.tokenURI(tokenId)).to.equal(TOKEN_URI);
    expect(await nft.balanceOf(addr1.address)).to.equal(1);

    await expect(tx)
      .to.emit(nft, "NFTMinted")
      .withArgs(tokenId, addr1.address, gameId, rank, TOKEN_URI);
  });

  it("Should revert minting by non-game contract", async function () {
    await expect(
      nft.connect(addr1).mintNFT(addr1.address, 1, 1, TOKEN_URI)
    ).to.be.revertedWith("Only game contract can call");
  });

  it("Should revert minting with invalid recipient", async function () {
    await expect(
      nft.connect(gameContract).mintNFT(ethers.ZeroAddress, 1, 1, TOKEN_URI)
    ).to.be.revertedWith("Invalid recipient address");
  });

  it("Should revert minting with invalid rank", async function () {
    await expect(
      nft.connect(gameContract).mintNFT(addr1.address, 1, 0, TOKEN_URI)
    ).to.be.revertedWith("Invalid rank");
    await expect(
      nft.connect(gameContract).mintNFT(addr1.address, 1, 4, TOKEN_URI)
    ).to.be.revertedWith("Invalid rank");
  });

  it("Should revert minting with empty token URI", async function () {
    await expect(
      nft.connect(gameContract).mintNFT(addr1.address, 1, 1, "")
    ).to.be.revertedWith("Invalid token URI");
  });

  it("Should allow owner to set game contract", async function () {
    await nft.setGameContract(addr2.address);
    expect(await nft.gameContract()).to.equal(addr2.address);
  });

  it("Should revert setGameContract by non-owner", async function () {
    await expect(
      nft.connect(addr1).setGameContract(addr2.address)
    ).to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount").withArgs(addr1.address);
  });

  it("Should revert setGameContract with invalid address", async function () {
    await expect(
      nft.setGameContract(ethers.ZeroAddress)
    ).to.be.revertedWith("Invalid game contract address");
  });
});