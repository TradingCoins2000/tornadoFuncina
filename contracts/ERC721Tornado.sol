// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./Tornado.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract ERC721Tornado is Tornado {
    IERC721 public token;

    uint[] public index;
    uint public i = 1;

    constructor(
        IVerifier _verifier, // (Verifier code deployed on Sepolia at: 0x44053158940898135D48f927A358d6Db91337F4D (by me!)
        IHasher _hasher, // (deployed at seponia "identical" NOT By ME!) 0x01B4e4e6E468Bb7f55101cfFfB8cF7aB4b09C6a9
        uint32 _merkleTreeHeight, // adopt 20
        IERC721 _token // direcion del contracto token (temporal) VotePersNFT.sol //0xC923F9Fc218c372FB06a69977aa5aD51E019E52a (deploy by me in sepolia)
    ) Tornado(_verifier, _hasher, _merkleTreeHeight) {
        token = _token;
    }

    function _processDeposit(uint _denomination) internal override {
        token.transferFrom(msg.sender, address(this), _denomination);
        index[i] = _denomination;
        i++;
    }

    function _processWithdraw(address payable _recipient) internal override {
        require(
            index.length > 0,
            "Incorrect refund amount received by the contract"
        );
        uint denomination = index[i];
        i--;
        token.transferFrom(address(this), _recipient, denomination);
    }
}
