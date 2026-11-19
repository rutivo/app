// Lee los datos fiscales de un proveedor (empresa) de un texto: foto de una
// factura, tarjeta, membrete o lo que te pasen pegado. Función pura.

const strip = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

const PROVINCES = ['alava', 'albacete', 'alicante', 'almeria', 'asturias', 'avila', 'badajoz', 'barcelona', 'burgos', 'caceres', 'cadiz', 'cantabria',
  'castellon', 'ciudad real', 'cordoba', 'cuenca', 'girona', 'gerona', 'granada', 'guadalajara', 'guipuzcoa', 'gipuzkoa', 'huelva', 'huesca', 'baleares',
  'illes balears', 'jaen', 'la coruna', 'a coruna', 'la rioja', 'las palmas', 'leon', 'lleida', 'lerida', 'lugo', 'madrid', 'malaga', 'murcia', 'navarra',
  'ourense', 'orense', 'palencia', 'pontevedra', 'salamanca', 'santa cruz de tenerife', 'segovia', 'sevilla', 'soria', 'tarragona', 'teruel', 'toledo',
  'valencia', 'valladolid', 'vizcaya', 'bizkaia', 'zamora', 'zaragoza', 'ceuta', 'melilla', 'espana', 'spain'];
const isProvince = (l) => PROVINCES.includes(strip(l).toLowerCase().replace(/[^a-z ]/g, '').trim());

const COMPANY = /\b(s\.?\s?l\.?\s?u\.?|s\.?\s?l\.?|s\.?\s?a\.?\s?u\.?|s\.?\s?a\.?|s\.?\s?coop\.?|sociedad|limitada|an[oó]nima|c\.?\s?b\.?|s\.?\s?l\.?\s?l\.?)\s*$/i;
const STREET = /^(c\/|c\.\s|av\.|pº|pol\.|(calle|avda|avenida|plaza|pza|plza|paseo|camino|carretera|ctra|urb|urbanizacion|urbanización|poligono|polígono|pasaje|ronda|travesia|travesía|via|vía|edificio|edif|local|parque)\b)/i;
const NIF = /\b([ABCDEFGHJNPQRSUVW][\s.-]?\d{7}[\s.-]?[0-9A-J]|\d{8}[\s.-]?[A-Z]|[XYZ][\s.-]?\d{7}[\s.-]?[A-Z])\b/i;
const LABEL = /^(raz[oó]n social|nombre|empresa|cliente|proveedor|nif|cif|n\.?i\.?f\.?|c\.?i\.?f\.?|direcci[oó]n|domicilio|c\.?p\.?|c[oó]digo postal|localidad|poblaci[oó]n|ciudad|provincia|tel[eé]fono|tel|email|e-mail|web)\s*[:.]?\s*/i;

const titleCaseKeep = (s) => (/[a-z]/.test(s) ? s : s.toLowerCase().replace(/(^|[\s-])\S/g, (c) => c.toUpperCase()));

/** Datos del proveedor: {nom, nif, dir, cp, loc}. Lo que no encuentre, vacío. null si no hay nada útil. */
export function readProvider(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n')
    .map((l) => l.replace(/[|_]+/g, ' ').replace(/\bN\s?[%°ºo]\s?(?=\d)/g, 'Nº').replace(/\s+/g, ' ').trim()) // "N%8" → "Nº8"
    .filter((l) => l && /[a-z0-9]/i.test(l));
  const labeled = (re) => {
    for (const l of lines) { const m = l.match(new RegExp('^(' + re + ')\\s*[:.]?\\s*(.+)$', 'i')); if (m) return m[2].trim(); }
    return '';
  };

  // NIF / CIF
  const nifLine = lines.find((l) => NIF.test(l.toUpperCase()));
  const nif = nifLine ? nifLine.toUpperCase().match(NIF)[1].replace(/[\s.-]/g, '') : '';

  // Nombre: con etiqueta; si no, la línea con "S.L.", "S.A."…; si no, la primera antes del NIF
  let nom = labeled('raz[oó]n social|nombre|empresa|proveedor');
  if (!nom) nom = lines.find((l) => COMPANY.test(l)) || '';
  if (!nom && nifLine) {
    const i = lines.indexOf(nifLine);
    nom = lines.slice(0, i).reverse().find((l) => !STREET.test(l) && !/\d{5}/.test(l) && !isProvince(l)) || '';
  }
  nom = nom.replace(NIF, '').replace(LABEL, '').trim();

  // Código postal (5 cifras de 01xxx a 52xxx que no sean parte de un NIF o teléfono)
  const cpLine = lines.find((l) => l !== nifLine && /(^|\D)(0[1-9]|[1-4]\d|5[0-2])\d{3}(\D|$)/.test(l) && !/\d{6,}/.test(l.replace(/\s/g, '')));
  const cp = labeled('c\\.?p\\.?|c[oó]digo postal').match(/\d{5}/)?.[0] || (cpLine ? cpLine.match(/(?:^|\D)((?:0[1-9]|[1-4]\d|5[0-2])\d{3})(?:\D|$)/)[1] : '');

  // Dirección: con etiqueta o la línea que empieza por Calle, Avda., Plaza…
  let dir = labeled('direcci[oó]n|domicilio') || lines.find((l) => STREET.test(l)) || '';
  // Localidad: con etiqueta; o junto al CP ("29780 Nerja"); o la que va pegada al final de la dirección
  let loc = labeled('localidad|poblaci[oó]n|ciudad');
  if (!loc && cpLine) {
    const rest = cpLine.replace(/\d{5}/, '').replace(/[-,()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (rest && !/^(espana|spain)$/i.test(strip(rest)) && rest !== nom && !STREET.test(rest)) loc = rest; // "29007 Málaga": la capital vale
  }
  if (!loc && dir) {
    // "Calle Ruperto Anduez Nº8 Nerja": lo que va detrás del número es la localidad
    const m = dir.match(/^(.*?(?:n[º°o.]?\s*\d+[a-z]?|\b\d+[a-z]?|s\/n))[\s,-]+([A-ZÁÉÍÓÚÑ][\p{L}' -]{2,})$/iu);
    if (m && !isProvince(m[2])) { dir = m[1].trim(); loc = m[2].trim(); }
  }
  if (!loc) {
    const prov = lines.find(isProvince);
    if (prov && !/^(espana|spain)$/i.test(strip(prov).replace(/[^a-z ]/gi, '').trim())) loc = prov.replace(/[\d,()-]/g, '').trim();
  }
  if (!nom && !nif && !dir) return null;
  return {
    nom: titleCaseKeep(nom),
    nif,
    dir: dir.replace(/[\s,]+$/, ''),
    cp,
    loc: titleCaseKeep(loc.replace(/[\s,]+$/, '')),
  };
}
