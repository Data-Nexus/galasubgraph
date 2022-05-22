/** 
 * Basically copied from @openzeppelin/subgraphs code with unwanted code removed
 * Copying the code allows for mints and burns to be added
 */

import {
	ethereum,
	BigInt,
} from '@graphprotocol/graph-ts'

import {
	Account,
	ERC1155Burn,
	ERC1155Contract,
	ERC1155Mint,
	ERC1155Transfer,
} from '../../generated/schema'

import {
	ApprovalForAll as ApprovalForAllEvent,
	TransferBatch  as TransferBatchEvent,
	TransferSingle as TransferSingleEvent,
	URI            as URIEvent,
} from '../../generated/erc1155/IERC1155'

import {
	constants,
	decimals,
	events,
	transactions,
    
} from '@amxx/graphprotocol-utils'

import {
	fetchAccount,
} from '../utils/account'

import {
	fetchERC1155,
	fetchERC1155Token,
	fetchERC1155Balance,
	fetchERC721Operator,
    replaceURI,
} from '../utils/erc1155'

/**
 * if both from and to are address zero do not register a mint or a burn. These transactions have zero value anyway. 
 * @param event 
 * @param suffix 
 * @param contract 
 * @param operator 
 * @param from 
 * @param to 
 * @param id 
 * @param value 
 * 
 */
function registerTransfer(
	event:    ethereum.Event,
	suffix:   string,
	contract: ERC1155Contract,
	operator: Account,
	from:     Account,
	to:       Account,
	id:       BigInt,
	value:    BigInt)
: void
{
	let token      	= fetchERC1155Token(contract, id)
	let ev         	= new ERC1155Transfer(events.id(event).concat(suffix))
	ev.emitter     	= contract.id
	ev.transaction 	= transactions.log(event).id
	ev.timestamp   	= event.block.timestamp
	ev.contract    	= contract.id
	ev.token       	= token.id
	ev.operator    	= operator.id
	ev.value       	= decimals.toDecimals(value)
	ev.valueExact  	= value
	ev.from 		= from.id 
	ev.to			= to.id 

	if (from.id == constants.ADDRESS_ZERO.toHexString() ) {
        
		if(to.id != constants.ADDRESS_ZERO.toHexString()) {
			// Fresh minty mint!
			let mintId 				= ev.transaction.concat('/').concat(events.id(event))
			let mint 				= new ERC1155Mint(mintId)
			mint.emitter			= contract.id 
			mint.transaction		= transactions.log(event).id
			mint.timestamp			= event.block.timestamp
			mint.contract			= contract.id 
			mint.token				= token.id 
			mint.operator			= operator.id 
			mint.to					= to.id 
			mint.toBalance			= fetchERC1155Balance(token, to).id
			mint.valueExact			= value 
			mint.value				= decimals.toDecimals(value)
			mint.save()
		}

		let totalSupply        	= fetchERC1155Balance(token, null)
		totalSupply.valueExact 	= totalSupply.valueExact.plus(value)
		totalSupply.value      	= decimals.toDecimals(totalSupply.valueExact)
		totalSupply.save()
	} else {
		let balance            = fetchERC1155Balance(token, from)
		balance.valueExact     = balance.valueExact.minus(value)
		balance.value          = decimals.toDecimals(balance.valueExact)
		balance.save()

		ev.fromBalance         = balance.id
	}

	if (to.id == constants.ADDRESS_ZERO.toHexString()) {
		if(from.id != constants.ADDRESS_ZERO.toHexString()){
			// Burn baby, burn!
			let burnId 				= ev.transaction.concat('/').concat(events.id(event))
			let burn 				= new ERC1155Burn(burnId)
			burn.emitter			= contract.id 
			burn.transaction		= transactions.log(event).id
			burn.timestamp			= event.block.timestamp
			burn.contract			= contract.id 
			burn.token				= token.id 
			burn.operator			= operator.id 
			burn.from				= from.id 
			burn.fromBalance		= fetchERC1155Balance(token, from).id
			burn.valueExact			= value 
			burn.value				= decimals.toDecimals(value)
			burn.save()
		}

		let totalSupply        = fetchERC1155Balance(token, null)
		totalSupply.valueExact = totalSupply.valueExact.minus(value)
		totalSupply.value      = decimals.toDecimals(totalSupply.valueExact)
		totalSupply.save()
	} else {
		let balance            = fetchERC1155Balance(token, to)
		balance.valueExact     = balance.valueExact.plus(value)
		balance.value          = decimals.toDecimals(balance.valueExact)
		balance.save()

		ev.toBalance           = balance.id
	}

	token.save()
	ev.save()
}

export function handleTransferSingle(event: TransferSingleEvent): void
{
	let contract = fetchERC1155(event.address)
	let operator = fetchAccount(event.params.operator)
	let from     = fetchAccount(event.params.from)
	let to       = fetchAccount(event.params.to)

	registerTransfer(
		event,
		"",
		contract,
		operator,
		from,
		to,
		event.params.id,
		event.params.value
	)
}

export function handleTransferBatch(event: TransferBatchEvent): void
{
	let contract = fetchERC1155(event.address)
	let operator = fetchAccount(event.params.operator)
	let from     = fetchAccount(event.params.from)
	let to       = fetchAccount(event.params.to)

	let ids    = event.params.ids
	let values = event.params.values

	// If this equality doesn't hold (some devs actually don't follox the ERC specifications) then we just can't make
	// sens of what is happening. Don't try to make something out of stupid code, and just throw the event. This
	// contract doesn't follow the standard anyway.
	if(ids.length == values.length)
	{
		for (let i = 0;  i < ids.length; ++i)
		{
			registerTransfer(
				event,
				"/".concat(i.toString()),
				contract,
				operator,
				from,
				to,
				ids[i],
				values[i]
			)
		}
	}
}

export function handleApprovalForAll(event: ApprovalForAllEvent): void {
	let contract         = fetchERC1155(event.address)
	let owner            = fetchAccount(event.params.account)
	let operator         = fetchAccount(event.params.operator)
	let delegation       = fetchERC721Operator(contract, owner, operator)
	delegation.approved  = event.params.approved
	delegation.save()
}

export function handleURI(event: URIEvent): void
{
	let contract = fetchERC1155(event.address)
	let token    = fetchERC1155Token(contract, event.params.id)
	token.uri    = replaceURI(event.params.value, event.params.id)
	token.save()
}
