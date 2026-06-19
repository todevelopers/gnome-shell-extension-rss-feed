// tXml v6.0.0 - https://github.com/tobiasnickel/tXml
// MIT License - Copyright (c) 2015 Tobias Nickel

function decodeEntities(value) {
	return value.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, function(match, entity) {
		if (entity === 'amp') return '&';
		if (entity === 'lt') return '<';
		if (entity === 'gt') return '>';
		if (entity === 'quot') return '"';
		if (entity === 'apos') return "'";

		if (entity[0] === '#') {
			var isHex = entity[1] === 'x' || entity[1] === 'X';
			var num = parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
			if (!Number.isNaN(num) && num >= 0 && num <= 0x10FFFF) {
				try {
					return String.fromCodePoint(num);
				} catch (e) {
					return match;
				}
			}
		}

		return match;
	});
}

export function parse(S, options) {
	options = options || {};

	var pos = options.pos || 0;
	var keepComments = !!options.keepComments;
	var keepWhitespace = !!options.keepWhitespace;
	var decodeEntitiesEnabled = !!options.decodeEntities;

	var openBracket = "<";
	var openBracketCC = "<".charCodeAt(0);
	var closeBracket = ">";
	var closeBracketCC = ">".charCodeAt(0);
	var minusCC = "-".charCodeAt(0);
	var slashCC = "/".charCodeAt(0);
	var exclamationCC = '!'.charCodeAt(0);
	var questionMarkCC = '?'.charCodeAt(0);
	var singleQuoteCC = "'".charCodeAt(0);
	var doubleQuoteCC = '"'.charCodeAt(0);
	var equalSignCC = '='.charCodeAt(0);
	var openCornerBracketCC = '['.charCodeAt(0);
	var closeCornerBracketCC = ']'.charCodeAt(0);
	var questionCC = '?'.charCodeAt(0);

	function parseChildren(tagName) {
		var children = [];
		while (S[pos]) {
			if (S.charCodeAt(pos) == openBracketCC) {
				if (S.charCodeAt(pos + 1) === slashCC) {
					var closeStart = pos + 2;
					pos = S.indexOf(closeBracket, pos);

					var closeTag = S.substring(closeStart, pos);
					if (closeTag.indexOf(tagName) == -1) {
						var parsedText = S.substring(0, pos).split('\n');
						throw new Error(
							'Unexpected close tag\nLine: ' + (parsedText.length - 1) +
							'\nColumn: ' + (parsedText[parsedText.length - 1].length + 1) +
							'\nChar: ' + S[pos]
						);
					}

					if (pos + 1) pos += 1;

					return children;
				} else if (S.charCodeAt(pos + 1) === exclamationCC) {
					if (S.charCodeAt(pos + 2) == minusCC) {
						const startCommentPos = pos;
						while (pos !== -1 && !(S.charCodeAt(pos) === closeBracketCC && S.charCodeAt(pos - 1) == minusCC && S.charCodeAt(pos - 2) == minusCC && pos != -1)) {
							pos = S.indexOf(closeBracket, pos + 1);
						}
						if (pos === -1) {
							pos = S.length;
						}
						if (keepComments) {
							children.push(S.substring(startCommentPos, pos + 1));
						}
					} else if (
						S.charCodeAt(pos + 2) === openCornerBracketCC &&
						S.charCodeAt(pos + 8) === openCornerBracketCC &&
						S.substr(pos + 3, 5).toLowerCase() === 'cdata'
					) {
						var cdataEndIndex = S.indexOf(']]>', pos);
						if (cdataEndIndex == -1) {
							children.push(S.substr(pos + 9));
							pos = S.length;
						} else {
							children.push(S.substring(pos + 9, cdataEndIndex));
							pos = cdataEndIndex + 3;
						}
						continue;
					} else {
						const startDoctype = pos + 1;
						pos += 2;
						var encapsuled = false;
						while ((S.charCodeAt(pos) !== closeBracketCC || encapsuled === true) && S[pos]) {
							if (S.charCodeAt(pos) === openCornerBracketCC) {
								encapsuled = true;
							} else if (encapsuled === true && S.charCodeAt(pos) === closeCornerBracketCC) {
								encapsuled = false;
							}
							pos++;
						}
						children.push(S.substring(startDoctype, pos));
					}
					pos++;
					continue;
				}
				var node = parseNode();
				children.push(node);
			} else {
				var text = parseText();
				if (keepWhitespace) {
					if (text.length > 0) {
						children.push(text);
					}
				} else {
					var trimmed = text.trim();
					if (trimmed.length > 0) {
						children.push(trimmed);
					}
				}
				pos++;
			}
		}
		return children;
	}

	function parseText() {
		var start = pos;
		pos = S.indexOf(openBracket, pos) - 1;
		if (pos === -2)
			pos = S.length;
		var text = S.slice(start, pos + 1);
		return decodeEntitiesEnabled ? decodeEntities(text) : text;
	}

	var nameSpacer = '\r\n\t>/= ';

	function parseName() {
		var start = pos;
		while (nameSpacer.indexOf(S[pos]) === -1 && S[pos]) {
			pos++;
		}
		return S.slice(start, pos);
	}

	var SelfClosingTags = options.selfClosingTags || options.noChildNodes || ['img', 'br', 'input', 'meta', 'link', 'hr'];

	function parseNode() {
		pos++;
		const tagName = parseName();
		const isProcessingInstruction = tagName[0] === '?';
		const instructionContentStart = pos;
		const attributes = {};
		let children = [];

		while (
			S[pos] &&
			S.charCodeAt(pos) !== closeBracketCC &&
			!(isProcessingInstruction && S.charCodeAt(pos) === questionMarkCC && S.charCodeAt(pos + 1) === closeBracketCC)
		) {
			var c = S.charCodeAt(pos);
			if ((c > 64 && c < 91) || (c > 96 && c < 123)) {
				var name = parseName();
				var value = null;

				while (S.charCodeAt(pos) === 32 || S.charCodeAt(pos) === 9 || S.charCodeAt(pos) === 10 || S.charCodeAt(pos) === 13) {
					pos++;
				}

				if (S.charCodeAt(pos) === equalSignCC) {
					pos++;

					while (S.charCodeAt(pos) === 32 || S.charCodeAt(pos) === 9 || S.charCodeAt(pos) === 10 || S.charCodeAt(pos) === 13) {
						pos++;
					}

					var code = S.charCodeAt(pos);
					if (code === singleQuoteCC || code === doubleQuoteCC) {
						value = parseString();
						if (pos === -1) {
							return { tagName, attributes, children };
						}
					} else if (code && code !== closeBracketCC) {
						var valueStart = pos;
						while (S[pos] && nameSpacer.indexOf(S[pos]) === -1) {
							pos++;
						}
						value = S.slice(valueStart, pos);
						if (decodeEntitiesEnabled) {
							value = decodeEntities(value);
						}
					}
				}
				attributes[name] = value;
				continue;
			}
			pos++;
		}

		if (isProcessingInstruction) {
			var instructionContent = S.slice(instructionContentStart, pos).trim();

			if (instructionContent.length > 0 && Object.keys(attributes).length === 0) {
				children = [instructionContent];
			}

			if (S.charCodeAt(pos) === questionMarkCC && S.charCodeAt(pos + 1) === closeBracketCC) {
				pos += 2;
			} else if (S.charCodeAt(pos) === closeBracketCC) {
				pos += 1;
			}

			return { tagName, attributes, children };
		}

		if (S.charCodeAt(pos - 1) !== slashCC && S.charCodeAt(pos - 1) !== questionCC) {
			if (tagName == "script") {
				var start = pos + 1;
				pos = S.indexOf('</script>', pos);
				children = [S.slice(start, pos)];
				pos += 9;
			} else if (tagName == "style") {
				var start = pos + 1;
				pos = S.indexOf('</style>', pos);
				children = [S.slice(start, pos)];
				pos += 8;
			} else if (SelfClosingTags.indexOf(tagName) === -1) {
				pos++;
				children = parseChildren(tagName);
			} else {
				pos++;
			}
		} else {
			pos++;
		}
		return { tagName, attributes, children };
	}

	function parseString() {
		var startChar = S[pos];
		var startpos = pos + 1;
		pos = S.indexOf(startChar, startpos);
		var value = S.slice(startpos, pos);
		return decodeEntitiesEnabled ? decodeEntities(value) : value;
	}

	function findElements() {
		if (!options || !options.attrName || !options.attrValue) return -1;
		var r = new RegExp('\\s' + options.attrName + '\\s*=[\'"]' + options.attrValue + '[\'"]').exec(S);
		if (r) {
			return r.index;
		} else {
			return -1;
		}
	}

	var out;

	if (options.attrValue !== undefined) {
		options.attrName = options.attrName || 'id';
		out = [];

		while ((pos = findElements()) !== -1) {
			pos = S.lastIndexOf('<', pos);
			if (pos !== -1) {
				out.push(parseNode());
			}
			S = S.substr(pos);
			pos = 0;
		}
	} else if (options.parseNode) {
		out = parseNode();
	} else {
		out = parseChildren('');
	}

	return out;
}
