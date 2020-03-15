/*
 * Decoder is a generic DPT decoder that is based on the information of KNX master data.
 */


'use strict';

const knxmaster = require('path').join(__dirname, 'knxmaster.json');
let raw_types = JSON.parse(require('fs').readFileSync(knxmaster), 'utf-8');

//console.dir(raw_types);

/**
 * Converts any DPT-like string into the harmonised ETS5 format. "DPT1.0234" becomes {main:"DPT-1", sub:"DPST-1-234"}
 * ------
 * 
 * @param {String} dptstring - The String Object looking like a DPT
 * @returns {Object} - {main: String ,sub: String | undefined}
 */
function uniformDPT(dptstring) {
	// for DPTx.yz (conventional format) use .match(/(\d+)(\.(\d+))?/)
	// for DP(S)T-x-z (from ETS exports) use .match(/(\d+)(\-(\d+))?/) 
	// combined: match(/(\d+)(?:(\.|-)(\d+))?/)
	let uniformarray = dptstring.match(/(\d+)(?:(\.|-)(\d+))?/);
	if (parseInt(uniformarray[1])>0) {
		// main type 
		let main = parseInt(uniformarray[1]); 
		let sub = null;
		if (parseInt(uniformarray[3])>0) {
			// subtype
			let sub = parseInt(uniformarray[3]);
			return {main:'DPT-'+main, sub: 'DPST-'+ main +'-'+ sub};
		}
		return {main:'DPT-'+main};
	}
	return null;
}
/**
 * Returns an Object representing the main DPT and if one fits, the sub type, taken from the DPT master list object.
 * 
 * @param {String|Object} dptstring - Either a string representing an DPT or an Object created from uniformDPT()
 * @returns {main: {}, sub: {}}
 */
function getDPT(dptstring) {
	let type;
	if (typeof dptstring==='string') {
		type = uniformDPT(dptstring);
	} else {
		type = dptstring;
	}
	if (raw_types.hasOwnProperty(type.main)) {
		let mType = raw_types[type.main];
		if (mType.subtypes && type.sub) {
			if (mType.subtypes.hasOwnProperty(type.sub)) {
				return {main:mType, sub: mType.subtypes[type.sub]};
			}
		}
		// there was no subtype matching. However, there are DEFAULT subtypes that have to taken if no subtype was specified!
		// search it.
		if (mType.subtypes) {
			for ( let allsubtypes in mType.subtypes) {
				if (mType.subtypes[allsubtypes].hasOwnProperty('Default')) {
					if (mType.subtypes[allsubtypes].Default === 'true') { // literally 'true' that's how it is in the JSON
						return {main:mType, sub:mType.subtypes[allsubtypes]};
					}
				}
			}
		}
		// last resort: spit out the first one 
		if (mType.subtypes) {
			for ( let allsubtypes in mType.subtypes) {
				if (mType.subtypes.hasOwnProperty(allsubtypes)) {
						return {main:mType, sub:mType.subtypes[allsubtypes]};
				}
			}
		}
		// give up
		return {main:mType};
	}
	return null;
}
/**
 * Help function to keep the decode() function a bit more readable. UInts have the most pitfalls, so they are bundled
 * into an own function here
 * 
 * @param {Buffer} buffer - The buffer to be parsed
 * @param {Number} bitsProcessed - The bits that already have been processed by other calls/formats
 * @param {Number} bitsToRead - The number of bits for the UInt. Allowed are 1..7, 8, 16, 32
 * @returns {Number}
 */
function decodeUINT(buffer, bitsProcessed, bitsToRead) {
	let bytesRead = Math.floor(bitsProcessed/8);
	if (bitsToRead<8) {
		// assumption: only fraction of bytes can lay cross bytes, longer UInts are complete set of bytes in the telegram
		bitsProcessed = bitsProcessed % 8; // only current byte is interesting here
		if ((bitsProcessed) + bitsToRead > 8) {
			// laps over to the next byte
			// within this byte
			let mask = 0;
			for (let i=0; i<(8-bitsProcessed); i++) {
				mask += Math.pow(2, 7-(bitsProcessed) -i);
			}
			// mask it 
			let v1 = (buffer[bytesRead] & mask) << ((bitsProcessed+bitsToRead)-8);
			// next byte
			mask = 0;
			for (let i=0; i<((bitsProcessed+bitsToRead)-8); i++) {
				mask += Math.pow(2, 7-i);
			}
			// mask it 
			let v2 = (buffer[bytesRead+1] & mask) >> (16-(bitsProcessed+bitsToRead));
			return v1 | v2;
		} else {
			// within this byte
			let mask = 0;
			for (let i=0; i<bitsToRead; i++) {
				mask += Math.pow(2, 7-bitsProcessed-i);
			}
			// mask it and shift it
			let v = (buffer[bytesRead] & mask) >> (8-bitsProcessed-(bitsToRead));
			return v;
		}
	} else {
		// larger UINTs
		switch (bitsToRead) {
		case 8: 
			return buffer[bytesRead];
//			break;
		case 16:
			return buffer.readUInt16BE(bytesRead);
//			break;
		case 32:
			return buffer.readUInt32BE(bytesRead);
//			break;
		}
	}
}

/**
 * decodes the payload of a telegram into an object with the payload's interpreted data. The returned object contains
 * one child object for each contained DPT-format (most types just have one format), plus an 'subitems' entry with the
 * number of formats contained, and a 'TypeText' entry specifying the type of the DPT. All format child objects contain
 * a value field, containing the numeric value of the section (except for char/string types DPT4 & 16). ### Example: {
 * '0': { value: 1, interpretation: 'True', Unit: undefined }, TypeText: 'boolean', subitems: 1 } #### Enumerative types
 * (such as HVAC control modes) have the Text of the mode in 'interpretation'. ####
 * 
 * @param {Buffer} payload
 * @param {string|Object} dpttype - Either a string to be converted to a DPT decriptive object or the descriptive object
 *        returned from uniformDPT()
 * @returns {Object}
 */
function decode(payload, dpttype) {
	if (!dpttype) {
		return null;
	}
	let result = {};
	let typeObj = getDPT(dpttype);
//	console.log('decode.typeObj -------------------------');
//	console.dir(typeObj.main.Id);
	if (!typeObj) {
		return {err: 'DPT could not be found: ' + dpttype };
	}
	
	let props = {}; 
	
	result.TypeText = typeObj.sub.Text;
	if (typeObj.sub) {
		// it is a sub-type
		props = typeObj.sub; 
	} else {
		// just the main type
		props = typeObj.main;
	}
	result.TypeText = props.Text;
	result.DPT = props.Id;
	// format processing
	
	// the number of bits expected in the payload
	let totalBits = parseInt(typeObj.main.SizeInBit);

	// check if buffer has the right minimum size
	if (payload.length*8 < totalBits) {
		console.log('[ERR] telegram payload too few bits for given DPT: ' + payload.length*8 + '<' + totalBits );
		result.err = '[ERR] telegram payload too few bits for given DPT: ' + payload.length*8 + '<' + totalBits;
		return result; // text and no value
	}
	
	// if typeObj has no subtype, just read the number of bytes and exit
	if (!typeObj.sub) {
		console.log('[ERR] Reading bytes and convert to number and exit');
		// TODO implementation!!!!!!!!!!!!
		result.err = '[ERR] DPT with no defined default subtype, and none was given.';
		return result;
	}
	
	// Iterate the format entries
	// bitsProcessed contains the number of bits that have been read and processed into values
	let bitsProcessed = 0;
	let bytesRead = 0;
	if (totalBits<=6) {
		// exception: for short telegrams (length<= 6 bits) 
		// the least bits are the value bits only, data is send together with steering info byte
		bitsProcessed = 8-totalBits;
	}
	result.subitems = typeObj.sub.Format.length;
	for (let fmt=0; fmt<typeObj.sub.Format.length; fmt++) {
		let form = typeObj.sub.Format[fmt];
		let bitsToRead;
		switch (form.type) {
		case 'Bit':	
			// get one bit from the current byte
			bitsProcessed++;
			let val = (payload[bytesRead] & Math.pow(2, 8-bitsProcessed)) >> (8-bitsProcessed);
			result[fmt] = {
				value: val,
				interpretation: val ? form.Set: form.Cleared
			};
			break;
		case 'UnsignedInteger':
			/*
			 * Depending on the Width
			 */
			
			if (form.Width) {
				bitsToRead = parseInt(form.Width);
			} else {
				bitsToRead = form.totalBits;
			}
			if (bitsToRead<=8) {
				result[fmt] = {
					value: Math.round(decodeUINT(payload, bitsProcessed, bitsToRead) * (parseFloat(form.Coefficient) || 1))
				};					
			} else {
				result[fmt] = {
					value: decodeUINT(payload, bitsProcessed, bitsToRead) * (parseFloat(form.Coefficient) || 1)
				};	
			}
			bitsProcessed += bitsToRead;
			break;
		case 'Enumeration':
			if (form.Width) {
				bitsToRead = parseInt(form.Width);
			} else {
				bitsToRead = form.totalBits;
			}
			let numvalue = decodeUINT(payload, bitsProcessed, bitsToRead);
			result[fmt] = {
				value: numvalue,
				interpretation: form.enumeration[numvalue].Text
			};	
			bitsProcessed += bitsToRead;
			break;
		case 'SignedInteger':
			// assumption: signed integers come in multiples of 8 bits and are always at byte alignment
			switch (parseInt(form.Width)) {
			case 8: 
				result[fmt] = {
					value: Math.round(payload.readUInt8(bytesRead) * (parseFloat(form.Coefficient) || 1)) // no decimals
				};
				break;
			case 16:
				result[fmt] = {
					value: payload.readUIntBE16(bytesRead) * (parseFloat(form.Coefficient) || 1)
				};
				break;
			case 32:
				result[fmt] = {
					value: payload.readUIntBE32(bytesRead) * (parseFloat(form.Coefficient) || 1)
				};
				break;
			}
			bitsProcessed += parseInt(form.Width);
			break;
		case 'Float':
//			console.log('Float of length ' + form.Width );
			switch (parseInt(form.Width)) {
			case 16:
				  let value = payload.readUInt16BE(0);
				  let sign = (value & 0x8000) >> 15;
				  let exp = (value & 0x7800) >> 11;
				  let mant = (value & 0x07ff);
				  if(sign !== 0) {
				    mant = -(~(mant - 1) & 0x07ff);
				  }
					result[fmt] = {
						value: Math.round(0.01 * mant * Math.pow(2,exp)*100)/100
					};
				  break;
			case 32: 
				result[fmt] = {
					value: payload.readFloatBE(bytesRead)
				};
				break;
			}
			bitsProcessed += parseInt(form.Width);
			break;
			
		case 'String':
			if (form.Encoding=== "us-ascii") {
				result[fmt] = {
					value: payload.toString('ascii', bytesRead, bytesRead+parseInt(form.Width)/8)
				};
			} else {
				result[fmt] = {
					value: payload.toString('latin1', bytesRead, bytesRead+parseInt(form.Width)/8)
				};
			}

			bitsProcessed += parseInt(form.Width);
			break;
		case 'Reserved':
			// just advance the number of bits
			bitsProcessed += parseInt(form.Width);
			result[fmt] = {value: null, interpretation:'reserved'};
			break;
		default:
			console.log('Unhandled format ' + form.type);
			result[fmt] = {value: null, interpretation:'unknown', lengthBits: parseInt(form.Width) };
			bitsProcessed += (parseInt(form.Width) || 0); // avoid NaN
		} // switch
		bytesRead = Math.floor(bitsProcessed/8);
		if (form.Unit) {
			result[fmt].Unit= form.Unit;
		}
		if (form.Name) {
			result[fmt].Name= form.Name;
		}
	}
	return result;
}


function convenienceDecode(payload, dpttype, locale) {
	let type;
	if (typeof dpttype==='string') {
		type = uniformDPT(dpttype);
	} else {
		type = dpttype;
	}
	let result = decode(payload, type);
	if (!result.err) {
		switch (result.DPT) {
		case 'DPST-11-1': // date
			if (result[5].value<90) {
				result[5].value += 2000;
			} else {
				result[5].value += 1900;
			}
			console.log(result["3"].value);
			result.value = new Date(result["5"].value,result["3"].value-1,result["1"].value).toLocaleDateString(locale, { year: "numeric", month: "2-digit", day: "2-digit" });
			return result;
		case 'DPST-10-1': // time
			result.value = '' + result[1].value + ':' + result[3].value + ':' + result[5].value;
			return result;
		default:
			if (result.subitems===1) {
				result.value = result[0].value;
				return result;
			}
		}
	}
	return result;
}

module.exports.decode = decode; 
module.exports.uniformDPT = uniformDPT;
module.exports.getDPT = getDPT;
module.exports.convenienceDecode = convenienceDecode;
