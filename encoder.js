const ENTITIES = {
	// XML mandatory
	amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
	// Latin-1 supplement
	nbsp: ' ', iexcl: '¡', cent: '¢', pound: '£',
	curren: '¤', yen: '¥', brvbar: '¦', sect: '§',
	uml: '¨', copy: '©', ordf: 'ª', laquo: '«',
	not: '¬', shy: '­', reg: '®', macr: '¯',
	deg: '°', plusmn: '±', sup2: '²', sup3: '³',
	acute: '´', micro: 'µ', para: '¶', middot: '·',
	cedil: '¸', sup1: '¹', ordm: 'º', raquo: '»',
	frac14: '¼', frac12: '½', frac34: '¾', iquest: '¿',
	Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã',
	Auml: 'Ä', Aring: 'Å', AElig: 'Æ', Ccedil: 'Ç',
	Egrave: 'È', Eacute: 'É', Ecirc: 'Ê', Euml: 'Ë',
	Igrave: 'Ì', Iacute: 'Í', Icirc: 'Î', Iuml: 'Ï',
	ETH: 'Ð', Ntilde: 'Ñ', Ograve: 'Ò', Oacute: 'Ó',
	Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö', times: '×',
	Oslash: 'Ø', Ugrave: 'Ù', Uacute: 'Ú', Ucirc: 'Û',
	Uuml: 'Ü', Yacute: 'Ý', THORN: 'Þ', szlig: 'ß',
	agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã',
	auml: 'ä', aring: 'å', aelig: 'æ', ccedil: 'ç',
	egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë',
	igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï',
	eth: 'ð', ntilde: 'ñ', ograve: 'ò', oacute: 'ó',
	ocirc: 'ô', otilde: 'õ', ouml: 'ö', divide: '÷',
	oslash: 'ø', ugrave: 'ù', uacute: 'ú', ucirc: 'û',
	uuml: 'ü', yacute: 'ý', thorn: 'þ', yuml: 'ÿ',
	// Latin extended
	OElig: 'Œ', oelig: 'œ', Scaron: 'Š', scaron: 'š',
	Yuml: 'Ÿ', fnof: 'ƒ', circ: 'ˆ', tilde: '˜',
	// Spaces & directionals
	ensp: ' ', emsp: ' ', thinsp: ' ',
	zwnj: '‌', zwj: '‍', lrm: '‎', rlm: '‏',
	// Typography
	ndash: '–', mdash: '—',
	lsquo: '‘', rsquo: '’', sbquo: '‚',
	ldquo: '“', rdquo: '”', bdquo: '„',
	dagger: '†', Dagger: '‡', bull: '•', hellip: '…',
	permil: '‰', prime: '′', Prime: '″',
	lsaquo: '‹', rsaquo: '›', oline: '‾', frasl: '⁄',
	euro: '€', trade: '™',
	// Greek
	Alpha: 'Α', Beta: 'Β', Gamma: 'Γ', Delta: 'Δ',
	Epsilon: 'Ε', Zeta: 'Ζ', Eta: 'Η', Theta: 'Θ',
	Iota: 'Ι', Kappa: 'Κ', Lambda: 'Λ', Mu: 'Μ',
	Nu: 'Ν', Xi: 'Ξ', Omicron: 'Ο', Pi: 'Π',
	Rho: 'Ρ', Sigma: 'Σ', Tau: 'Τ', Upsilon: 'Υ',
	Phi: 'Φ', Chi: 'Χ', Psi: 'Ψ', Omega: 'Ω',
	alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ',
	epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
	iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ',
	nu: 'ν', xi: 'ξ', omicron: 'ο', pi: 'π',
	rho: 'ρ', sigmaf: 'ς', sigma: 'σ', tau: 'τ',
	upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ',
	omega: 'ω', thetasym: 'ϑ', upsih: 'ϒ', piv: 'ϖ',
	// Math & symbols
	weierp: '℘', image: 'ℑ', real: 'ℜ', alefsym: 'ℵ',
	larr: '←', uarr: '↑', rarr: '→', darr: '↓', harr: '↔',
	crarr: '↵', lArr: '⇐', uArr: '⇑', rArr: '⇒', dArr: '⇓', hArr: '⇔',
	forall: '∀', part: '∂', exist: '∃', empty: '∅',
	nabla: '∇', isin: '∈', notin: '∉', ni: '∋',
	prod: '∏', sum: '∑', minus: '−', lowast: '∗',
	radic: '√', prop: '∝', infin: '∞', ang: '∠',
	and: '∧', or: '∨', cap: '∩', cup: '∪',
	int: '∫', there4: '∴', sim: '∼', cong: '≅',
	asymp: '≈', ne: '≠', equiv: '≡', le: '≤', ge: '≥',
	sub: '⊂', sup: '⊃', nsub: '⊄', sube: '⊆', supe: '⊇',
	oplus: '⊕', otimes: '⊗', perp: '⊥', sdot: '⋅',
	lceil: '⌈', rceil: '⌉', lfloor: '⌊', rfloor: '⌋',
	lang: '〈', rang: '〉', loz: '◊',
	spades: '♠', clubs: '♣', hearts: '♥', diams: '♦',
};

// String.fromCodePoint throws above U+10FFFF and one such entity would fail the whole feed, so it stays as it is like an unknown name
const fromCodePoint = (code, entity) => code > 0x10FFFF ? entity : String.fromCodePoint(code);

const Encoder = {
	htmlDecode(s) {
		if (!s || /^\s+$/.test(s)) return '';
		let prev;
		do {
			prev = s;
			s = s
				.replace(/&#x([0-9a-fA-F]+);/gi, (m, h) => fromCodePoint(parseInt(h, 16), m))
				.replace(/&#([0-9]+);/g, (m, d) => fromCodePoint(parseInt(d, 10), m))
				.replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (m, name) => ENTITIES[name] ?? m);
		} while (s !== prev);
		return s;
	}
};

export function getInstance() {
	return Encoder;
}
