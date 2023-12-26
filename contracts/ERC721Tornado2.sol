// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./MerkleTreeWithHistory.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
//import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

interface IVerifier {
    // (Verifier code deployed on Sepolia at: 0x44053158940898135D48f927A358d6Db91337F4D (by me!)
    function verifyProof(
        bytes memory _proof,
        uint256[6] memory _input
    ) external returns (bool);
}

contract ERC721Tornado2 is
    IERC721Receiver,
    MerkleTreeWithHistory,
    ReentrancyGuard,
    ERC721
{
    IERC721 public immutable token;
    IVerifier public immutable verifier;

    mapping(bytes32 => bool) public nullifierHashes;
    mapping(bytes32 => bool) public commitments;

    uint[1048576] private index; // 2**20
    uint private i = 1;
    uint256 private _nextTokenId;

    event Deposit(
        bytes32 indexed commitment,
        uint32 leafIndex,
        uint256 timestamp
    );
    event Withdrawal(
        address to,
        bytes32 nullifierHash,
        address indexed relayer,
        uint256 fee
    );

    constructor(
        IVerifier _verifier, // (Verifier code deployed on Sepolia at: 0x44053158940898135D48f927A358d6Db91337F4D (by me!)
        IHasher _hasher, // (deployed at seponia "identical" NOT By ME!) 0x01B4e4e6E468Bb7f55101cfFfB8cF7aB4b09C6a9
        uint32 _merkleTreeHeight, // adopt 20
        IERC721 _token // direcion del contracto token (temporal) VotePersNFT.sol //0xC923F9Fc218c372FB06a69977aa5aD51E019E52a (deploy by me in sepolia)
    )
        MerkleTreeWithHistory(_merkleTreeHeight, _hasher)
        ERC721("SuffrageVotePresNFT", "VPTO")
    {
        verifier = _verifier;
        token = _token;
    }

    function deposit(
        bytes32 _commitment,
        uint _nftIndex
    ) external payable nonReentrant {
        require(!commitments[_commitment], "The commitment has been submitted");
        //  console.log("dentro Tornado");
        // console.log(_nftIndex);

        uint32 insertedIndex = _insert(_commitment); // insert (at the MerkleTreeWithHistory) the commitment in the Merkle Tree.
        commitments[_commitment] = true; // to avoid double insertion (not really necessary).

        token.safeTransferFrom(
            payable(msg.sender),
            payable(address(this)),
            _nftIndex
        );

        index[i] = _nftIndex;
        i++;
        emit Deposit(_commitment, insertedIndex, block.timestamp);
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        // console.log("entro en onERC721recived");
        return IERC721Receiver.onERC721Received.selector;
    }

    function withdraw(
        bytes calldata _proof,
        bytes32 _root,
        bytes32 _nullifierHash,
        address _recipient,
        address _relayer, // do not use this
        uint256 _fee, // do not use this
        uint256 _refund // do not use this
    ) external payable nonReentrant {
        require(
            !nullifierHashes[_nullifierHash],
            "The note has been already spent"
        ); // veryfy if it already removed the NFT

        require(isKnownRoot(_root), "Cannot find your merkle root"); // Make sure to use a recent one
        require(
            verifier.verifyProof(
                _proof,
                [
                    uint256(_root),
                    uint256(_nullifierHash),
                    uint256(uint160(_recipient)),
                    uint256(uint160(_relayer)),
                    _fee,
                    _refund
                ]
            ),
            "Invalid withdraw proof"
        );

        ///preocess witdraw
        nullifierHashes[_nullifierHash] = true;
        //require(_recipient != msg.sender, "same wallet! Change the wallet!");
        uint256 tokenId = _nextTokenId++;
        _safeMint(_recipient, tokenId);

        // fin precess withdraw

        emit Withdrawal(_recipient, _nullifierHash, _relayer, _fee);
    }

    function isSpent(bytes32 _nullifierHash) public view returns (bool) {
        return nullifierHashes[_nullifierHash];
    }
}
