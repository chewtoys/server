/*
 * VPDB - Visual Pinball Database
 * Copyright (C) 2016 freezy <freezy@xbmc.org>
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */

"use strict";

var _ = require('lodash');
var ent = require('ent');
var logger = require('winston');
var request = require('request');

var error = require('./error')('ipdb');

function Ipdb() {
}

/**
 * Returns structured data from IPDB for a given IPDB number.
 * @param {number} ipdbNo IPDB number
 * @param {{ offline: boolean }} [opts] `offline` - if set, use local index instead of IPDB live query.
 * @return Promise
 */
Ipdb.prototype.details = function(ipdbNo, opts) {

	opts = opts || {};
	if (opts.offline) {
		const ipdb = require('../../data/ipdb.json');
		const match = _.find(ipdb, i => i.ipdb.number === parseInt(ipdbNo));
		if (!match) {
			return Promise.reject(error('IPDB entry ' + ipdbNo + ' does not exist in local index. Try without the offline option.'));
		}
		return Promise.resolve(match);
	}

	return Promise.try(() => {
		var url = 'http://www.ipdb.org/machine.cgi?id=' + ipdbNo;
		logger.info('[ipdb] Fetching %s', url);
		return new Promise((resolve, reject) => {
			request({ url: url, timeout: 30000 }, function(err, response, body) {
				/* istanbul ignore if */
				if (!response) {
					throw error('Timeout while trying to reach IPDB.org. Please try again later.').log();
				}
				/* istanbul ignore if */
				if (err) {
					return reject(err);
				}
				resolve([response, body]);
			});
		});

	}).spread((response, body) => {
		/* istanbul ignore if */
		if (response.statusCode !== 200) {
			logger.error('[ipdb] Wrong response code, got %s instead of 200. Body: %s', response.statusCode, body);
			throw error('Wrong response data from IPDB.').log();
		}
		return parseDetails(body);

	});
};

/* istanbul ignore next */
Ipdb.prototype.findDead = function(data) {
	var id, ids = [];
	for (var i = 0; i < data.length; i++) {
		id = i + 1 + ids.length;
		if (data[i].ipdb.number !== id) {
			ids.push(id);
			i--;
		}
	}
	return ids;
};

function parseDetails(body) {

	var tidyText = function(m) {
		m = striptags(m).replace(/<br>/gi, '\n\n');
		return ent.decode(m.trim());
	};

	return Promise.try(() => {
		var m = body.match(/<a name="(\d+)">([^<]+)/i);
		var game = { ipdb: {}};

		/* istanbul ignore else */
		if (m) {
			game.title = trim(m[2]);
			game.ipdb.number = number(m[1]);
			game.ipdb.mfg = number(firstMatch(body, /Manufacturer:\s*<\/b>.*?mfgid=(\d+)/i));
			if (game.ipdb.mfg && manufacturerNames[game.ipdb.mfg]) {
				game.manufacturer = manufacturerNames[game.ipdb.mfg];
			} else {
				game.manufacturer = firstMatch(body, />Manufacturer:.*?<a href="search\.pl\?searchtype=advanced&amp;mfgid=\d+">([^<]+)/i, function(m) {
					return m.replace(/[\s,]+$/, '');
				});
			}
			game.model_number = firstMatch(body, /Model Number:\s*<\/b><\/td><td[^>]*>([\da-z]+)/i);
			game.year = number(firstMatch(body, /href="machine\.cgi\?id=\d+">\d+<\/a>\s*<I>[^<]*?(\d{4})/i));

			game.game_type = firstMatch(body, /Type:\s*<\/b><\/td><td[^>]*>([^<]+)/i, function(m) {
				var mm = m.match(/\((..)\)/);
				return mm ? mm[1].toLowerCase() : null;
			});

			game.ipdb.rating = firstMatch(body, /Average Fun Rating:.*?Click for comments[^\d]*([\d\.]+)/i);
			game.short = firstMatch(body, /Common Abbreviations:\s*<\/b><\/td><td[^>]*>([^<]+)/i, function(m) {
				return m.split(/,\s*/);
			});
			game.produced_units = firstMatch(body, /Production:\s*<\/b><\/td><td[^>]*>([\d,]+)\s*units/i, function(m) {
				return number(m.replace(/,/g, ''));
			});
			game.themes = firstMatch(body, /Theme:\s*<\/b><\/td><td[^>]*>([^<]+)/i, function(m) {
				return m.split(/\s+-\s+/gi);
			});
			game.designers = firstMatch(body, /Design by:\s*<\/b><\/td><td[^>]*><span[^>]*>(.*?)<\/tr>/i, function(m) {
				return ent.decode(striptags(m)).split(/,\s*/);
			});
			game.artists = firstMatch(body, /Art by:\s*<\/b><\/td><td[^>]*><span[^>]*>(.*?)<\/tr>/i, function(m) {
				return ent.decode(striptags(m)).split(/,\s*/);
			});

			game.features = firstMatch(body, /Notable Features:\s*<\/b><\/td><td[^>]*>(.*?)<\/td>/i, tidyText);
			game.notes = firstMatch(body, /Notes:\s*<\/b><\/td><td[^>]*>(.*?)<\/td>/i, tidyText);
			game.toys = firstMatch(body, /Toys:\s*<\/b><\/td><td[^>]*>(.*?)<\/td>/i, tidyText);
			game.slogans = firstMatch(body, /Marketing Slogans:\s*<\/b><\/td><td[^>]*>([\s\S]*?)<\/td>/i, tidyText);

			return game;
		} else {

			if (/<\/script>\s*<hr width="80%">/.test(body)) {
				throw error('Empty page. Looks like IPDB number does not exist.').status(404);
			} else {
				throw error('Cannot parse game details from page body. Are you sure the provided IPDB No. exists?');
			}
		}
	});
}

function firstMatch(str, regex, postFn) {
	var m = str.match(regex);
	if (m && postFn) {
		return postFn(m[1].replace(/&nbsp;/gi, ' '));
	} else if (m) {
		return m[1].replace(/&nbsp;/gi, ' ');
	} else {
		return undefined;
	}
}

function number(str) {
	if (_.isUndefined(str)) {
		return undefined;
	}
	return parseInt(str);
}

function trim(str) {
	return str.replace(/[^-\w\d\s\.,:_'"()&/]/ig, '');
}

function striptags(str) {
	return str.replace(/<(?:.|\n)*?>/gm, '');
}

var manufacturerNames = {
	2: 'Hankin',
	9: 'A.B.T.',
	16: 'All American Games',
	18: 'Allied Leisure',
	20: 'Alvin G.',
	32: 'Astro Games',
	33: 'Atari',
	47: 'Bally',
	48: 'Midway',
	49: 'Wulff',
	53: 'Bell Coin Matics',
	54: 'Bell Games',
	62: 'Briarwood',
	55: 'Bensa',
	71: 'CEA',
	76: 'Capcom',
	81: 'Chicago Coin',
	83: 'Unidesa',
	93: 'Gottlieb',
	94: 'Gottlieb',
	98: 'Data East',
	115: 'Europlay',
	117: 'Exhibit',
	120: 'Fascination',
	126: 'Game Plan',
	129: 'Geiger',
	130: 'Genco',
	135: 'Guiliano Lodola',
	139: 'Grand Products',
	141: 'Great States',
	145: 'Jac Van Ham',
	153: 'I.D.I.',
	156: 'Inder',
	157: 'Interflip',
	159: 'International Concepts',
	165: 'Jeutel',
	170: 'Juegos Populares',
	204: 'Maresa',
	206: 'Marvel',
	213: 'Midway',
	214: 'Bally',
	219: 'Mirco',
	222: 'Mr. Game',
	224: 'Gottlieb',
	235: 'Bell Games',
	239: 'P & S',
	242: 'Pamco',
	248: 'Petaco',
	249: 'Peyper',
	250: 'Pierce Tool',
	252: 'Pinstar',
	255: 'Playmatic',
	257: 'Premier',
	262: 'Petaco',
	267: 'Richard',
	269: 'Rock-ola',
	279: 'Sega',
	280: 'Sega',
	281: 'Williams',
	282: 'Sonic',
	302: 'Stern',
	303: 'Stern',
	311: 'Christian Tabart',
	313: 'Tecnoplay',
	317: 'Midway',
	323: 'United',
	324: 'Universal',
	328: 'Unknown',
	333: 'Viza',
	337: 'Wico',
	349: 'Williams',
	350: 'Williams',
	351: 'Williams',
	352: 'Williams',
	356: 'Zaccaria',
	359: 'RMG',
	367: 'Taito',
	371: 'Recreativos Franco',
	375: 'Spinball',
	419: 'Century Consolidated Industries',
	429: 'Acorn',
	458: 'Rowamet',
	447: 'Delmar',
	448: 'Electromatic',
	465: 'IDSA',
	467: 'LTD',
	477: 'Pinball Shop',
	482: 'Esteban',
	483: 'ICE',
	495: 'Elbos',
	530: 'Advertising Poster Company',
	532: 'United',
	549: 'Professional Pinball of Toronto',
	555: 'Fipermatic',
	671: 'Spooky',
	697: 'Skillpins'
};

Ipdb.prototype.owners = {
	1: "A & M Vending Machine Company of Brooklyn, New York, USA",
	2: "A. Hankin & Company of Australia",
	3: "A. J. Stephens and Company of Kansas City, Missouri, USA",
	4: "A. M. Amusement Games of Los Angeles, California, USA",
	5: "A. M. Walzer Company of St. Paul, Minnesota, USA",
	6: "A. S. Douglis Machine Company of Chicago, Illinois, USA",
	7: "A. Zapp Manufacturing Company of Dallas, Texas",
	8: "A.B.C. Coin Machine Company of Chicago, Illinois, USA",
	9: "A.B.T. Manufacturing Company of Chicago, Illinois, USA",
	10: "A.M.I of Italy",
	11: "Ace Manufacturing Company of Brooklyn, New York, USA",
	12: "Ace Novelty Company of Chicago, Illinois, USA",
	13: "Acme Coin Machine Manufacturing Company of Chicago, Illinois",
	14: "Alben of France",
	15: "All American Amusements",
	16: "All American Games Corporation of Chicago, Illinois, USA",
	17: "Allied Amusement Company of Los Angeles, California, USA",
	18: "Allied Leisure Industries, Incorporated of Hialeah, Florida",
	19: "Allswell Manufacturing Company of Chicago, Illinois, USA",
	20: "Alvin G. and Company",
	21: "American Amusement Company of Chicago, Illinois, USA",
	22: "American Mill and Manufacturing Company of Dallas, Texas, USA",
	23: "American Sales Corporation of Chicago, Illinois, USA",
	24: "American Scale Manufacturing Company of Washington, D.C., USA",
	25: "Amusement Corporation of America of Chicago, Illinois, USA",
	26: "Amusement Novelty Supply Company of Elmira, New York",
	27: "Arco Sales Co. of Philadelphia, Pennsylvania",
	28: "Arkon Automaten GmbH, of Frankfurt, Germany",
	29: "Arlington Sales Company of Coldwater, Michigan, USA",
	30: "Artistic Novelty Works of Chicago, Illinois, USA",
	31: "Artists and Creators Guild Incorporated of Chicago, Illinois, USA",
	32: "Astro Games Incorporated",
	33: "Atari, Incorporated",
	34: "Atlas Indicator Works Incorporated of Chicago, Illinois, USA",
	35: "Atlas Manufacturing Company of New York, New York, USA",
	36: "Auto Bell Novelty Company of Chicago, Illinois, USA",
	37: "Automat Games Company of Chicago, Illinois, USA",
	38: "Automatic Amusements Company of Los Angeles, California, USA",
	39: "Automatic Engineering Corporation",
	40: "Automatic Games Company of Inglewood, California, USA",
	41: "Automatic Games Company of St. Paul, Minnesota",
	42: "Automatic Industries, Incorporated of Youngstown, Ohio, USA",
	43: "Automatic Jobbers Association, Incorporated",
	44: "B. G. Melton and Company of Richmond, Virginia, USA",
	45: "Baker Novelty and Manufacturing Company",
	46: "Bell Products Company of Chicago, Illinois, USA",
	47: "Bally Manufacturing Corporation",
	48: "Bally Midway Manufacturing Company",
	49: "Bally Wulff of Germany",
	50: "Barok Company of Columbus, Ohio, USA",
	51: "Bay City Games, Incorporated of Bay City, Michigan, USA",
	52: "Paul E. Berger Manufacturing Company of Chicago, Illinois, USA",
	53: "Bell Coin Matics of Bologna, Italy",
	54: "Bell Games of Bologna, Italy",
	55: "Bensa of Milan, Italy",
	56: "Better Games Company of Flint, Michigan, USA",
	57: "Beverator Company of Cambridge, Ohio, USA",
	58: "Bill's Novelty Company",
	59: "Bingo Novelty Manufacturing Company of Chicago, Illinois, USA",
	60: "Block Marble Company of Philadelphia, Pennsylvania, USA",
	61: "Boyle Amusement Company of Oklahoma City, Oklahoma, USA",
	62: "Briarwood, A Division Of Brunswick Manufacturing Company",
	63: "Bridget Manufacturing Company of Pharr, Texas, USA",
	64: "Brunswick Manufacturing Company of Chicago, Illinois, USA",
	65: "Buckley Manufacturing Company of Chicago, Illinois, USA",
	66: "Burrows Automatic Supply Company, Ltd. of London, England",
	67: "Butler Specialty Company of Chicago, Illinois, USA",
	68: "C & S Novelty",
	69: "C. D. Fairchild Amusement Machine Corporation of Syracuse, New York, USA",
	70: "C. F. Eckhart & Company of Chicago, Illinois, USA",
	71: "Costruzioni Elettroniche Automatiche of Bologna, Italy",
	72: "Caille Bros. of Detroit, Michigan, USA",
	73: "Caille-Schiemer Company of Detroit, Michigan, USA",
	74: "California Exhibit Company of Los Angeles, California, USA",
	75: "California Games, Incorporated of Los Angeles, California, USA",
	76: "Capcom Coin-Op, Incorporated",
	77: "Capitol Automatic Music Company",
	78: "Carnival Supply Company",
	79: "Centro Matic S.A. of Spain",
	80: "Century Manufacturing Company of Chicago, Illinois, USA",
	81: "Chicago Coin Machine Manufacturing Company",
	82: "Chicago Vending Company of Chicago, Illinois, USA",
	83: "Universal de Desarrollos Electronicos S.A. of Barcelona, Spain",
	84: "Cisco Company Incorporated of Kansas City, Missouri, USA",
	85: "Coast Coin Machine Company of Sea Girt, New Jersey, USA",
	86: "Coffee-Mat Amusement Division of Kenilworth, New Jersey, USA",
	87: "Coin Game Manufacturing Company of Chicago, Illinois, USA",
	88: "Coincraft Corporation of Chicago, Illinois, USA",
	89: "Coinomatic Corporation of Buffalo, New York, USA",
	90: "Como Manufacturing Corp. of Chicago, Illinois",
	91: "Comptoir Industriel De Fabrication Pour L'Automatique of France",
	92: "Consolidated Industries",
//	94: "D. Gottlieb & Company, a Columbia Pictures Industries Company",
	94: "D. Gottlieb & Company",
	95: "D. Robbins and Company of Brooklyn, New York, USA",
	96: "Dallas Novelty Sales Company Incorporated of Dallas, Texas, USA",
	97: "Dama S.R.L. of Milan, Italy",
	98: "Data East Pinball, Incorporated",
	99: "Daval Mfg Company Incorporated, G.B. of Chicago, Illinois, USA",
	100: "DeLuxe Amusement Company of San Antonio, Texas, USA",
	101: "Dennard-Williams & Dennard of Henderson, Texas, USA",
	102: "Device Manufacturers, Incorporated of Youngstown, Ohio, USA",
	103: "Ditta Artigiana Ricambi",
	104: "Ditta Ripepi s.p.a. of Messina, Italy",
	105: "Dixie Music Co. of Miami, Florida",
	106: "Dudley-Clark Company of Chicago, Illinois, USA",
	107: "Dyscus Manufacturing Company of Providence, Rhode Island, USA",
	108: "E. E. Junior Manufacturing Company",
	109: "E. G. S. of Italy",
	110: "E. M. Marchant of Levallois-Perret, France",
	111: "E. P. Johnson Manufacturing Company of Chicago, Illinois, USA",
	112: "Electro Black Diamond Double Pin Table Company of Corpus Christi, Texas, USA",
	113: "Elettrocoin of Firenze (Florence), Italy",
	114: "Empire Wood Working Company of Baltimore, Maryland, USA",
	115: "Europlay of Italy",
	116: "Excels",
	117: "Exhibit Supply Company of Chicago, Illinois, USA",
	118: "Exidy Incorporated",
	119: "F. W. Wettzel Novelty Works",
	120: "Fascination Int., Incorporated",
	121: "Fisher & Coe Manufacturing Company of Marysville, Ohio, USA",
	122: "Fliptronic of Holland",
	123: "Automatenbau Förster of Furth, West Germany",
	124: "Fred W. Kramer Amusement Company of Savannah, Georgia",
	125: "G. M. Laboratories, Incorporated of Chicago, Illinois, USA",
	126: "Game Plan, Incorporated of Illinois",
	127: "Gatter Manufacturing Company of Philadelphia, Pennsylvania, USA",
	128: "Gee Bee Manufacturing Company of Chicago, Illinois, USA",
	129: "Geiger-Automatenbau GmbH of Germany",
	130: "Genco Manufacturing Company of Chicago, Illinois, USA",
	131: "General Automatic Amusements, S.P.R.L. of Belgium",
	132: "General Novelty Manufacturing Company of Chicago, Illinois, USA",
	133: "Gerber's Games Incorporated of Chicago, Illinois, USA",
	134: "Giorgio Massiero of Milan, Italy",
	135: "Giuliano Lodola of Avenza, Massa-Carrera, Toscana, Italy",
	136: "Glickman Company of Philadelphia, Pennsylvania",
	137: "Globe Manufacturing Company of Chicago, Illinois, USA",
	138: "Gotham Pressed Steel Corporation",
	139: "Grand Products Incorporated of Elk Grove Village, Illinois, USA",
	140: "Great Lakes Coin Machine Company of Toledo, Ohio",
	141: "Great States Manufacturing Company of Kansas City, Missouri, USA",
	142: "Groetchen Tool and Die Company of Chicago, Illinois, USA",
	143: "H & M Manufacturing Company of Chicago, Illinois, USA",
	144: "H. C. Evans & Company of Chicago, Illinois, USA",
	145: "Jac van Ham of Tilburg, Holland",
	146: "MM Computer Games of Roma, Italy",
	147: "Hannahs Manufacturing Company",
	148: "Hawtins of Britain",
	149: "Hercules Novelty Company, Incorporated of Chicago, Illinois, USA",
	150: "Hi-Shot Manufacturing Company of San Antonio, Texas, USA",
	151: "Home Novelty and Sales Company of Altoona, Pennsylvania, USA",
	152: "Houston Showcase and Manufacturing Company of Houston, Texas, USA",
	153: "I.D.I. of Italy",
	154: "Illinois Pin Ball Incorporated",
	155: "In and Outdoor Games Company of Chicago, Illinois, USA",
	156: "Industria (Electromecánica) de Recreativos S.A of Madrid, Spain",
	157: "Interflip S. A. of Spain",
	158: "The International Automatic Company of Ipswich, England",
	159: "International Concepts of Kansas City, Missouri, USA",
	160: "International Mutoscope Reel Company, Incorporated of New York, New York, USA",
	161: "Irving Bromberg Company of Brooklyn, New York, USA",
	162: "J. H. Keeney and Company Incorporated of Chicago, Illinois, USA",
	163: "J. P. Seeburg Corporation of Chicago, Illinois, USA",
	164: "Jay Screw Products Corporation of Chicago, Illinois, USA",
	165: "Jeutel of France",
	166: "Joctronic Juegos Electronicos S.A. of Tarragona, Spain",
	167: "Johnson and Johnson",
	168: "Jolux of France",
	170: "Juegos Populares, S.A. of Madrid, Spain",
	171: "K & F Specialty Company of Chicago, Illinois, USA",
	172: "K-A Manufacturing Company of Toledo, Ohio, USA",
	173: "K-T Manufacturing Company",
	174: "Karom Golf Table Corporation of Pulaski, New York, USA",
	175: "Keeney and Sons of Chicago, Illinois, USA",
	176: "King Game Factories of Grand Rapids, Michigan, USA",
	177: "Klebba Novelty Company of Chicago, Illinois, USA",
	179: "Komputer Dynamics Corporation of Indianapolis, Indiana, USA",
	180: "Kozak Specialty Company of Chicago, Illinois, USA",
	181: "L & R Manufacturing Company of Chicago, Illinois, USA",
	182: "L. B. Elliott Products Company, Incorporated of Chicago, Illinois, USA",
	183: "Les Tasken Company of Indianapolis, Indiana, USA",
	184: "Lin Up Manufacturing Company",
	185: "Lincoln Manufacturing Company of Youngstown, Ohio, USA",
	186: "Lincoln Novelty Manufacturing Company of Marion, Virginia, USA",
	187: "Lindstrom Tool and Toy Company of Bridgeport, Connecticut",
	188: "Automaticos a.k.a. Talleres del Llobregat S.A. of Barcelona, Spain",
	189: "Lone Eagle Manufacturing Company of Agawam, Massachusetts, USA",
	190: "Los Angeles Games Company of Los Angeles, California, USA",
	191: "Louisville Novelty Manufacturing Company",
	192: "Lucky Star Manufacturing Company of Baltimore, Maryland, USA",
	193: "Lucky Strike Manufacturing Company of Baltimore, Maryland, USA",
	194: "Lynwood Manufacturing Company of Lynwood, California, USA",
	196: "M. Redgrave Bagatelle Company of Jersey City, New Jersey, USA",
	197: "MC and D.",
	198: "Maquinas Automaticas Computerizadas, S.A. of Madrid, Spain",
	199: "The Henry W.T. Mali & Co., Inc. of New York, New York",
	200: "Manhattan Sales Company of Evansville, Indiana, USA",
	201: "Manufacturas Automaticas Americanas of Barcelona, Spain",
	202: "Marble Games Company of Youngstown, Ohio, USA",
	204: "Maquinas Recreativas Sociedad Anonima of Madrid, Spain",
	205: "Markepp Manufacturing Company of Cleveland, Ohio, USA",
	206: "Marvel Manufacturing Company of Chicago, Illinois",
	207: "Mason and Company of Newark, New Jersey, USA",
	208: "Mattel Electronics Company",
	209: "Mayoni Enterprises",
	210: "Mechanical Manufacturing Company of Chicago, Illinois, USA",
	211: "Micropin Corporation of Pasadena, California",
	212: "Midlands",
	213: "Midway Manufacturing Company of Chicago, Illinois, USA",
//	214: "Midway Manufacturing Company, a subsidiary of WMS Industries, Incorporated of Chicago, Illinois, USA",
	214: "Midway Manufacturing Company, Incorporated of Chicago, Illinois, USA",
	215: "Midway Pattern Company of Chicago, Illinois, USA",
	216: "Midwest Sales Corporation",
	217: "Miller Cabinet Company of Kansas City, Missouri, USA",
	218: "Mills Novelty Company of Chicago, Illinois, USA",
	219: "Mirco Games, Incorporated of Phoenix, Arizona, USA",
	220: "Mondialmatic of Florence, Italy",
	221: "Moseley Vending Machine Exchange of Richmond, Virginia, USA",
	222: "Mr. Game of Bologna, Italy",
	223: "Munves Manufacturing Company of Chicago, Illinois",
	224: "Mylstar Electronics, Incorporated",
	225: "NSM Lions of Bingen, Germany",
	226: "Nate Schneller Incorporated",
	227: "National Automatic Machine Company of St. Paul, Minnesota, USA",
	228: "National Games",
	229: "National Pin Games Manufacturing Company of Detroit, Michigan, USA",
	230: "Nelson Manufacturing Company of Rockford, Illinois, USA",
	231: "Nordamatic of Verona, Italy",
	232: "Northwest Amusement Company of Portland, Oregon, USA",
	233: "Northwest Coin Machine Company of Chicago, Illinois, USA",
	234: "Novamatic S.p.A. of Milan, Italy",
	235: "Nuova Bell Games of Bologna, Italy",
	236: "O-Lett-O Novelty Company of Chicago, Illinois, USA",
	237: "O. D. Jennings and Company of Chicago, Illinois, USA",
	238: "Olympic Games Manufacturing Company of Chicago, Illinois, USA",
	239: "P & S Machine Company of Chicago, Illinois, USA",
	240: "Pace Manufacturing Company Incorporated of Chicago, Illinois, USA",
	241: "Pacent Novelty Manufacturing Company of Utica, New York, USA",
	242: "Pacific Amusement Manufacturing Company of Chicago, Illinois, USA",
	243: "Pacific Manufacturing Corporation",
	244: "Parlor Table Company of Saginaw, Michigan, USA",
	245: "Peerless Sales and Products Company of Kansas City, Missouri, USA",
	246: "Pennsylvania Novelty Company of New Brighton, Pennsylvania, USA",
	247: "Peo Manufacturing Corporation of Rochester, New York, USA",
	248: "Proyectos Electromecánicos de Tanteo y Color of Madrid, Spain",
	249: "Peyper of Spain",
	250: "Pierce Tool and Manufacturing Company of Chicago, Illinois, USA",
	251: "Pin Ball Manufacturing Company",
	252: "Pinstar",
	253: "Pioneer Coin Machine Company of Chicago, Illinois",
	254: "Playbar S.A. of Barcelona, Spain",
	255: "Playmatic of Barcelona, Spain",
	256: "Playmec of Bologna, Italy",
	257: "Premier Technology",
	258: "Proma",
	259: "R.& H. Sales Company",
	260: "R.H. Osbrink Manufacturing Company of Los Angeles, California",
	261: "Rally a.k.a. Rally Play Company of Nice, France",
	262: "Recel S. A. of Madrid, Spain",
	263: "Red Baron Amusements of Australia",
	264: "Reisinger Machine Works, Incorporated of Rochester, New York, USA",
	265: "Reliance Cabinet Company, Incorporated of Chicago, Illinois, USA",
	266: "Rex Manufacturing",
	267: "Richard Manufacturing Company of Winooski, Vermont, USA",
	268: "Richwine and Company of Chicago, Illinois, USA",
	269: "Rock-ola Manufacturing Corporation of Chicago, Illinois, USA",
	270: "Jack Rogers of France",
	271: "Rotor Table Games Co, Incorporated of New York, New York, USA",
	272: "Roy McGinnis Company of Baltimore, Maryland",
	273: "Royal Novelty Company of Baltimore, Maryland, USA",
	274: "Rube Gross & Company of Seattle, Washington, USA",
	275: "SIRMO Games S.A. of Verviers, Belgium",
	276: "Salmon of France",
	277: "Scientific Machine Corporation of Brooklyn, New York, USA",
	279: "Sega Enterprises, Ltd. of Tokyo, Japan",
	280: "Sega Pinball, Incorporated of Chicago, Illinois, USA",
	281: "Segasa of Spain",
	282: "Segasa d.b.a. Sonic of Spain",
	283: "Show Games of Belgium",
	284: "Shyvers Coin Automatic Machine Company of Seattle, Washington, USA",
	285: "Shyvers Manufacturing Company of Chicago, Illinois, USA",
	286: "Silver Star Manufacturing Company of Brooklyn, New York, USA",
	287: "Silver-Marshall, Incorporated of Chicago, Illinois, USA",
	288: "Simplex Phonograph Corporation of Chicago, Illinois, USA",
	289: "Skill-O Manufacturing Company of Cincinnati, Ohio, USA",
	290: "The Snicker Table Company of Pittsburgh, Kansas",
	291: "Soc. Elettrogiochi of Firenze (Florence), Italy",
	292: "Southern Automatic Sales Company of Louisville, Kentucky, USA",
	293: "Southwestern Novelty Company of Henderson, Texas, USA",
	294: "Specialty Manufacturing Company of Chicago, Illinois, USA",
	295: "Specialty Sales Company of Chicago, Illinois, USA",
	296: "Staal Society of Saint-Ouen, France",
	297: "Standard Amusement Company of Beaumont, Texas, USA",
	298: "Standard Games Company",
	299: "Standard Manufacturing Company of Chicago, Illinois, USA",
	300: "Star Machine Manufacturing, Incorporated of Bronx, New York, USA",
	301: "Sterling Manufacturing Company of Cleveland, Ohio, USA",
	302: "Stern Electronics, Incorporated of Chicago, Illinois, USA",
	303: "Stern Pinball, Incorporated of Chicago, Illinois, USA",
	304: "Stoner Manufacturing Company of Aurora, Illinois, USA",
	305: "Success Games Company of Milwaukee, Wisconsin, USA",
	306: "Sullivan-Nolan Advertising Company [WWII Conversions Only]",
	307: "Sunnisam Games Company of Chicago, Illinois, USA",
	308: "Supreme Vending Company, Incorporated",
	309: "T and M Sales Company of Chicago, Illinois, USA",
	310: "T.H. Bergmann & Company of Hamburg, Germany",
	311: "Christian Automatic of Montgeron, France",
	312: "Taito Trading Co., Ltd. of Japan",
	313: "Tecnoplay of San Marino, Italy",
	314: "The Ad-Lee Company, Incorporated of Chicago, Illinois, USA",
	315: "Field Manufacturing Corporation of Peoria, Illinois, USA",
	316: "The Harry Hoppe Corporation",
	317: "The Valley Company, Subsidiary of Walter Kidde & Company, Incorporated of Bay City, Michigan",
	318: "Treff Automaten of Germany",
	319: "Try Me Manufacturing Company of Baltimore, Maryland, USA",
	320: "Tura Automatenfabrik Gmbh of Leipzig, Germany",
	321: "Twin City Novelty Company of Minneapolis, Minnesota, USA",
	322: "United Amusement Company of San Antonio, Texas, USA",
	323: "United Manufacturing Company of Chicago, Illinois, USA",
	324: "Universal Company, Ltd. of Oyama, Japan",
	325: "Universal Industries, Inc. (Chicago) A subsidiary of United Manufacturing Co.",
	326: "Universal Manufacturing Company",
	327: "Universal Novelty Manufacturing Company of Chicago, Illinois, USA",
	328: "Unknown Manufacturer",
	329: "Van-Scho Corp of Chicago, Illinois, USA",
	330: "Venture Line",
	331: "Victory Games",
	332: "Victory Sales Company",
	333: "Viza",
	334: "W. J. C. Vending Company of New York, New York, USA",
	335: "W. N. Manufacturing Company of Los Angeles, California, USA",
	336: "Waddell Company, Incorporated of Greenfield, Ohio",
	337: "Wal-Bil Novelty Company of St. Louis, Missouri, USA",
	338: "Warren Manufacturing Company of Warren, Ohio, USA",
	339: "Watling Manufacturing Company of Chicago, Illinois, USA",
	340: "Westerhaus Amusement Company of Cheviot, Ohio",
	341: "Western Electric Piano Company of Chicago, Illinois, USA",
	342: "Western Equipment & Supply Company of Chicago, Illinois, USA",
	343: "Western Manufacturing Company of Chicago, Illinois, USA",
	344: "Western Products, Incorporated",
	345: "Whirlpool Sales Agency Incorporated of Youngstown, Ohio, USA",
	346: "Whiz Ball Manufacturing Company of Kansas City, Missouri, USA",
	347: "Wico Corporation of Chicago, Illinois, USA",
	348: "Widget Manufacturing Company",
//	349: "Williams Electronics Games, Incorporated, a subsidiary of WMS Ind., Incorporated",
	349: "Williams Electronics Games, Incorporated",
	350: "Williams Electronic Manufacturing Company",
	351: "Williams Electronics, Incorporated",
	352: "Williams Manufacturing Company",
	353: "Willy Michiels of Belgium",
	354: "Hamilton Manufacturing Company a.k.a. Hamilton Machine Co., Inc. of Minneapolis, Minnesota, USA",
	355: "World Manufacturing Company of New Haven, Connecticut, USA",
	356: "Zaccaria of Bologna, Italy",
	357: "Zenith Manufacturing Company of Chicago, Illinois, USA",
	358: "Zowie Distributing Company, Incorporated of Chicago, Illinois, USA",
	359: "Renato Montanari Giochi of Bologna, Italy",
	360: "Gillispie Games Company of Long Beach, California, USA",
	361: "Champion Games of Beverly, Massachusetts, USA",
	362: "Australian Poolette Company",
	363: "North Star Coin Machine Company of Montreal, Canada",
	364: "Renov' Automatic - Jolux of Marcoussis and Paris, France",
	365: "Century Games Limited of San Jose, California, USA",
	366: "Rapid Pinball of Kent Town, South Australia",
	367: "Taito do Brasil, a division of Taito, Japan",
	368: "Mecatronics, a.k.a. Taito (Brazil), a division of Taito of Japan",
	369: "Liberty, a.k.a. Taito (Brazil), a division of Taito of Japan",
	370: "Flipermatic, a.k.a. Taito (Brazil), a division of Taito of Japan",
	371: "Recreativos Franco of Madrid, Spain",
	372: "Fábrica de Aparatos Electro Mecánicos Recreativos, S.L of Madrid",
	373: "Famaresa",
	374: "Creaciones e Investigaciones Electrónicas, Sociedad Limitada of Madrid, Spain",
	375: "Spinball S.A.L. of Fuenlabrada, Spain",
	376: "Jumaci S.L. of Madrid, Spain",
	377: "Bill Port of Madrid, Spain",
	378: "Cedes S.A. of Barcelona, Spain",
	379: "CIC Play of Barcelona, Spain",
	380: "Roll-O Company of Rockaway, New York, USA",
	381: "Max Jentzsch & Meerz of Leipzig, Germany",
	382: "Penn-Ohio Games Company",
	383: "Apple Time of Italy",
	384: "United Specialty Company of Chicago, Illinois, USA",
	385: "Fischer, a Division of Questor Manufacturing Company",
	386: "Romagnoli of Italy",
	387: "Prosperity Coin Machine Corporation",
	388: "Carlson Manufacturing Company of Chicago, Illinois, USA",
	393: "Pacific Amusement Manufacturing Company of Los Angeles, California, USA",
	395: "Donald E Hooker of Los Angeles, California, USA",
	396: "C. E. Hoagland of Los Angeles, California, USA",
	397: "King Products Company of Los Angeles, California, USA",
	399: "Success Manufacturing Corporation of Chicago, Illinois, USA",
	400: "Coin Concepts, Incorporated",
	402: "Southland Engineering, Incorporated of Santa Monica, California, USA",
	403: "Tennyson Manufacturing Company of Chicago, Illinois, USA",
	405: "Splin S.A. of Liège, Belgium",
	410: "Gottlieb (All Years, All Company Names)",
	411: "Midway (All Years, All Company Names)",
	412: "Bally (All Years, All Company Names)",
	413: "Williams (All Years, All Company Names)",
	415: "Joseph Schneider Incorporated of New York, USA",
	416: "Rich Toys, Rich Manufacturing Company of Morrison, Illinois, USA",
	417: "Ward Bros Novelty Company of Jersey City, New Jersey, USA",
	418: "J. H. Singer of New York, New York, USA",
	419: "Century Consolidated Industries Company",
	420: "Carrohart Specialty Company of Chicago, Illinois, USA",
	421: "Electro-Ball Company of Dallas, Texas, USA",
	422: "The Seidel Amusement Machine Company of Albuquerque, New Mexico, USA",
	423: "Diverama of São Paulo, Brazil",
	424: "European Automaten Service of Germany",
	426: "Advance Automatic Machine Company of Britain",
	427: "Yoho & Hooker of Youngstown, Ohio, USA",
	428: "Sicking Manufacturing Company of Cincinnati, Ohio, USA",
	429: "Acorn Vending Company of Philadelphia, Pennsylvania, USA",
	431: "Witzig's Limited of England",
	432: "Churchill Cabinet of Cicero, Illinois",
	433: "Mortimer Glass Company of Pittsburg, Pennsylvania, USA",
	434: "Nu-Way Sales Company of Muskogee, Oklahoma, USA",
	435: "Shields of Bridlington, U.K.",
	436: "Sky Show of Italy",
	437: "Marsa of Spain",
	438: "Iberomatic S.A. of Barcelona, Spain",
	439: "Automave Servicios Sociedad Anónima of Madrid",
	441: "Monte Carlo Amusement Company",
	442: "Skillgame d.b.a. Renato Montanari Giochi of Bologna, Italy",
	443: "Dudouit Fils of Paris, France",
	444: "Royal Music Company of Webster, Massachusetts, USA",
	445: "Scott, Adickes & Cie of Paris, France",
	446: "Scott, Adickes & Company, Ltd of London, England",
	447: "Delmar Manufacturing Company of New York, New York, USA",
	448: "Electromatic Brasil",
	449: "Sentinel Inc.",
	450: "Billares Quevedo of Madrid, Spain",
	451: "Barni of Barcelona, Spain",
	452: "Shyvers Manufacturing Company of Seattle, Washington, USA",
	453: "Satem of Paris, France",
	454: "Baker Machine & Plating Company, Incorporated of Fort Worth, Texas, USA",
	455: "LORI of Bologna, Italy",
	456: "Bigliardini Elettronici Milano of Milano, Italy",
	457: "Ripepi of Messina, Italy",
	458: "Rowamet Indústria Eletrometalúrgica LTDA of São Paulo, Brazil",
	459: "Siegfried Schumacher of Germany",
	460: "L & V Mambelli of Cesena, Italy",
	461: "A & A Design Group of Argentina",
	462: "H. W. Goewey of Baltimore, Maryland, USA",
	463: "The Sharp-Boyd Company of Pittsburgh, Pennsylvania, USA",
	465: "Ideas y Diseños, Sociedad Anónima of Spain",
	466: "Fliperbol of São Paulo, Brazil",
	467: "LTD do Brasil Diversões Eletrônicas Ltda of Campinas, São Paulo, Brazil",
	468: "Games, Incorporated of Chicago, Illinois",
	469: "Dallas Novelty Company Incorporated of Dallas, Texas, USA",
	470: "Brooklyn Amusement Machine Co of Brooklyn, New York, USA",
	471: "Falls Manufacturing Company of Youngstown, Ohio, USA",
	472: "V. P. Distributing Company of St. Louis, Missouri, USA",
	473: "John Gille Company of Belgium",
	474: "Incredible Technologies, Incorporated",
	475: "Amusematic Corporation of Chicago, Illinois",
	477: "Pinball Shop of Bologna, Italy",
	478: "CMC Cresmatic, Sociedad Limitada of Spain",
	480: "Smith Manufacturing Company of Tampa, Florida, USA",
	481: "Lundick Mfg., Inc. of Youngstown, Ohio",
	482: "J. Esteban of São Paulo, Brazil",
	483: "Innovative Concepts in Entertainment, Inc. of Clarence, New York",
	484: "Hutchison Engineering Company of Nashville, Tennessee",
	485: "Bay-Tek Games, Incorporated of Pulaski, Wisconsin",
	486: "American Amusement & Mfg. Co., Inc. of Kansas City, Missouri",
	487: "Agamco, Inc. of Novi, Michigan",
	488: "Niemer S.A. of Barcelona, Spain",
	489: "Erich Büttner of Leipzig, Germany",
	490: "Superior Products Co. of Chicago, Illinois",
	491: "Hoosier Games Company of Louisville, Kentucky",
	492: "Zizzle Arcade Pinball of Bannockburn, Illinois",
	493: "Aisch & Melchers KG of Bochum, West Germany",
	494: "Pasini of Bologna, Italy",
	495: "Elbos Electronics of Italy",
	496: "American Home Entertainment, a division of Azrak-Hamway International, Inc.",
	497: "Clinton Berle Allen of Shepherd, Michigan",
	498: "Nash Manufacturing Company of Boston, Massachusetts",
	501: "Arcadia Novelty Company of England",
	503: "Sport Matic, S.A. of Spain",
	504: "Gerber & Glass Distributing Company of Chicago, Illinois",
	505: "Hi-Skor Amusement Company of Henderson, North Carolina",
	506: "King Amusement Company",
	507: "Royal Play",
	508: "Global VR of San Jose, California",
	509: "E.M. & H. Co. of Geneva, Illinois",
	510: "Fabulous Fantasies of Tarzana, California",
	511: "Pinball Manufacturing Inc., a division of Illinois Pinball Inc.",
	512: "Skilgames, Inc. of Alliance, Ohio",
	513: "The Superior Confection Company of Columbus, Ohio",
	514: "The W. C. Peters Company",
	515: "U.S Tehkan Inc. of Los Angeles, California",
	516: "Magister of Paris, France",
	517: "Roma-Automatic of Paris, France",
	518: "Bromley, Inc. of Northbrook, Illinois",
	519: "Charles Marshall Gravatt of Asheville, North Carolina",
	520: "Ad-Lee Company of Chicago, Illinois, USA",
	521: "Casa Escardibul of Barcelona, Spain",
	522: "Baldazzi of Bologna, Italy",
	523: "Lenoble of France",
	524: "Fantasy Games, Inc.",
	525: "Model Racing of Montemarciano - Ancona, Italy",
	526: "Salor, S.A of Barcelona, Spain",
	527: "Automatic Industries, Ltd. of Toronto, Canada",
	528: "Automatic Amusement Company of Memphis, Tennessee; Ft. Worth, Texas",
	529: "Dewey Coin Machine Company of Youngstown, Ohio",
	530: "Advertising Posters Company of Chicago, Illinois, USA",
	531: "United Profit Sales Company of Chicago, Illinois",
	532: "United Manufacturing Company (Diversey) of Chicago Illinois",
	533: "Ballota GmbH of Germany",
	534: "Colonial Specialties Company of Chicago, Illinois",
	535: "Yohio Manufacturing Company of Youngstown, Ohio",
	536: "Peerless Products Company of North Kansas City, Missouri",
	537: "Sterling Novelty Manufacturing Company of Cleveland, Ohio, USA",
	538: "Illinois Novelty Co. of Chicago, Illinois, USA",
	539: "Rumatic of Spain",
	540: "Alco of France",
	541: "Achille and Chalvignac of Paris, France",
	542: "Pessers & Moody of London, England",
	543: "Pessers, Moody, Wraith, & Gurr of London, England",
	544: "Kansas City Ball Table Company of Kansas City, Missouri",
	545: "Firestone Enterprises, Inc. of Brooklyn, New York",
	546: "Square Amusement Co. of New York, New York",
	548: "Seaboard New York Corporation of New York, New York",
	549: "Professional Pinball of Toronto, Ontario, Canada",
	550: "Electromaton, Inc. of Hoboken, New Jersey",
	551: "Standard Novelty Co.",
	552: "Gatter Novelty Company of Philadelphia, Pennsylvania, USA",
	553: "Midland Components, Ltd. of Coventry, England",
	554: "Thames Mfg. Co. of Danielson, Connecticut",
	555: "Fipermatic Indústria Comércio Importação e Exportação Ltda of Manaus, Brazil",
	557: "J. Kammen of Cleveland Heights, Ohio",
	558: "21st Century Entertainment of Wichita, Kansas",
	559: "Roto Manufacturing of Utica, New York",
	560: "Major Automatics Co. of United Kingdom",
	561: "Sigma of Japan",
	562: "Skee-Ball, Inc. of Chalfont, Pennsylvania",
	563: "MarsaPlay of Viator - Almeria, Spain",
	564: "Broadway Novelty Co. of Philadelphia, Pennsylvania",
	565: "Videodens of Madrid, Spain",
	566: "Secav of Orsay, France",
	567: "Japan Automatic Vending Machine Company, Ltd. of Tokyo, Japan",
	568: "Gamages of Holborn of London, England",
	569: "Baker-Case Manufacturing Company of Racine, Wisconsin",
	570: "Bonzini et Sopransi of Paris, France",
	571: "Geordan Corporation of Milwaukee, Wisconsin",
	572: "Superior Amusement Company of Portland, Oregon",
	573: "Superior Manufacturing Company of Portland, Oregon",
	574: "Phillips Electronics, Ltd. of Toronto, Canada",
	575: "Hy C Enterprises",
	576: "Valco Automatenbouw B.V. of Bergen op Zoom, Holland",
	577: "Culp Products Company of Elkhart, Indiana",
	578: "Viditis, S.P.R.L. of Brussels, Belgium (2009-Now)",
	579: "Central Manufacturing Co. of Chicago, Illinois",
	580: "Bifuca of Murcia, Spain",
	581: "T. S. Halpin & Co. Ltd. of Mt. Brydges, Ontario, Canada",
	582: "Ting-A-Ling Mfg. Co. of Chicago, Illinois",
	583: "International Playboard Company of Kansas City, Missouri",
	584: "Compagnie Industrielle Des appareils Automatiques of Paris, France",
	585: "Automatic Coin Machine Company of Chicago, Illinois",
	586: "Malaise Bury of Vieux-Condé, France",
	587: "Ranco Automaten A.G. of Thun, Switzerland",
	588: "Osbrink Games Company of Los Angeles, California",
	589: "Eagle of Italy",
	590: "The Slot Construction Company B.V.B.A. of Brabant, Belgium",
	591: "J. F. Thomas of Des Moines, Iowa",
	592: "Alfred Druschky of Berlin, Germany",
	593: "E. Grulet & Cie of Migennes, Yonne, France",
	594: "Great Northern Chair Company of Chicago, Illinois",
	595: "Birmingham Vending Company of Birmingham, Alabama",
	596: "The Piffle Novelty Co. of Warren, Ohio",
	597: "Advertising Craft Ltd. of Wellington, New Zealand",
	598: "Northwestern Mail Box Company of St. Louis, Missouri",
	599: "Naujoks-Schulze-Menke of Germany",
	600: "Binks Industries, Inc. of Chicago, Illinois",
	601: "HanaHo Games, Inc. of Cerritos, California",
	602: "C. & D. Manufacturing Company of Agawam, Massachusetts, USA",
	603: "Explomatic of Sevilla, Spain",
	604: "Vicman Automatic Machine Company, Ltd. of London, England",
	605: "Irmacor of Porto, Portugal",
	606: "California Games Company of Los Angeles, California",
	607: "International Mutoscope Corporation of Long Island City, Queens, New York",
	608: "Columbus Engraving Company of Columbus, Ohio",
	609: "E. Hood and Company of Great Falls, Montana",
	610: "Retro Pinball LLC of York, Pennsylvania",
	611: "Klode Shops",
	612: "Penny Ante Amusements Co. of Riverside, California",
	613: "The Rolo-Polo Company",
	614: "The Pinball Factory of Murrumbeena, Australia",
	615: "Giepen Associates, Inc. of River Grove, Illinois",
	616: "A. W. & Co. of Marburg, Germany",
	617: "Keaon Corporation of Taipei, Taiwan",
	618: "Creative Products of Downers Grove, Illinois",
	619: "Whizbang Pinball of Lake Villa, Illinois",
	620: "The Hoge Mfg. Co. Inc. of New York, USA",
	621: "Ewen, White & Co., Ltd. of London, England",
	622: "Omicron Technologies, Inc. of Bellingham, Washington",
	623: "Eurostar",
	624: "General Vending Sales Corporation of Baltimore, Maryland",
	625: "DeLo Specialty Co. of Ithaca, New York",
	626: "Arco Falc S.R.L. of Milan, Italy",
	627: "R.G. Kollmorgen of Coldwater, Michigan",
	628: "Md of Italy",
	629: "Warren Novelty Co. of Warren, Ohio",
	630: "Genesis, Inc. of Roselle, Illinois",
	631: "Ideal Steel Products Corp. of Chicago, Illinois",
	632: "Automaticos MonteCarlo of Spain",
	633: "VEB Luckenwalder Metallwarenfabrik of Luckenwalde, Germany",
	634: "Jersey Jack Pinball, Inc. of Lakewood, New Jersey (2013-Now)",
	635: "Recreativos Invermatic of Spain",
	636: "Advance Automatic Machine and Device Company",
	637: "Marbo Stimulator Co., Inc. of Hubbard, Ohio",
	638: "Automatenbau Paul Bohlmann of Berlin, Germany",
	639: "Reith & Company of Wüppertal, Germany",
	640: "The Brunswick-Balke-Collender Company of USA",
	642: "Eagle Sheet Metal Manufacturing Co. of Chicago, Illinois",
	643: "The Vending Machine Company of Fayetteville, North Carolina",
	644: "Eusebio Martinez Garcia of Spain",
	645: "B & L Co.",
	646: "Irving Kaye Co. Inc. of Brooklyn, New York",
	647: "A. L. Randall Company, Standard Games Dept. of Chicago, Illinois",
	648: "American Engineering Co. of Cambridge, Massachusetts",
	649: "American Games Engineering Co. of Cambridge, Massachusetts",
	650: "Earl & Koehler Manufacturing Company of Portland, Oregon",
	651: "ADP Automaten GmbH of Germany",
	652: "Royal Ball Mfg. Co. of Youngstown, Ohio",
	653: "Sankyo Precision Equipment Company, Ltd. of Tokyo, Japan",
	654: "Japan Amusement Machine Company, Ltd. of Japan",
	655: "Sankyo Amusement Park Equipment Company, Ltd. of Japan",
	656: "Taiwan YuanMei Co., Ltd. of Taiwan",
	657: "Sheraton Crafts of New York City, New York",
	658: "Pass-Time Table Company, Detroit, Michigan",
	659: "H. P. Schafer of Peoria, Illinois",
	660: "Amusement Machine Corporation, Ltd. of Los Angeles, California",
	661: "Amusement Machine Corporation of America, Ltd. of Hollywood, California",
	662: "Kieswetter KG of Dörfles-Esbach, Germany",
	663: "Comet of Dijon, France",
	664: "SOREX of Belgium",
	665: "The Garco Co. of Chicago, Illinois",
	666: "Esso Manufacturing Corp. of Hoboken, New Jersey",
	667: "George Ponser Co. of Chicago, Illinois",
	668: "The Shelden, Dickson & Steven Mfg. Co. of Omaha, Nebraska",
	669: "Westerhaus Manufacturing Company of Cheviot, Ohio",
	670: "Coleco Industries, Inc. of West Hartford, Connecticut",
	671: "Spooky Pinball LLC of Benton, Wisconsin",
	672: "Ro-S-Co of Canada",
	673: "FRANGAL-AIR Industrie of Landas, France",
	674: "Science Tech, trademark of Bowen Hill Ltd. of Hong Kong, China",
	675: "Kenyon Mfg. Co. of Chicago, Illinois",
	676: "Chicago Coin Machinery Company of Chicago, Illinois",
	678: "Panter Gaming of Ljubljana, Slovenia",
	679: "Novomatic AG of Gumpoldskirchen, Austria",
	680: "Glickman Industries of Philadelphia, Pennsylvania",
	681: "Leisure & Allied Industries of Perth, Australia",
	682: "Precision Automatics, Ltd.",
	683: "imem of Salerno, Italy",
	684: "Universal Space Amusement Co., Ltd. of Hong Kong, China",
	685: "Heighway Pinball, Ltd. of Merthyr Tydfil, Wales, UK (2014-Now)",
	686: "The Whiz-Bo Mfg. Co. of Youngstown, Ohio",
	687: "Dutch Pinball of Reuver, The Netherlands",
	688: "KOALA of England",
	689: "Caldwell Novelty Co. of Lenoir, North Carolina",
	690: "Bera Automatenfabrik of Berlin, Germany",
	691: "West & Rosenkranz of Leipzig, Germany",
	692: "Frees Bros. of Chicago, Illinois",
	693: "Electra Mfg. Co. of Kansas City, Missouri",
	694: "Day One Pinball Manufacturing, Incorporated of Huntley, Illinois, USA",
	695: "Planetary Pinball Supply, Inc. of San Jose, California",
	696: "Wanghe Mfg. Co. of Youngstown, Ohio",
	697: "Collins Entertainment, Inc. of Greenville, South Carolina",
	698: "Abbott Specialties Corp. of New York, New York",
	699: "Jocmatic S.A. of Terrassa, Barcelona, Spain",
	700: "Coin Device Mfg. Co. Inc. of Syracuse, New York",
	701: "John Ellson of Albany, New York",
	702: "Marx Toys"
};

var manufacturerGroups = {
	Gottlieb: [ 'Gottlieb', 'Mylstar', 'Premier' ],
	Bally: [ 'Bally', 'Midway' ]
};

module.exports = new Ipdb();