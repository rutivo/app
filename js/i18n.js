// Idioma de la app: español (por defecto) o inglés.
//
// La app está escrita en español. En inglés, un «traductor de pantalla» cambia los
// textos que se ven (MutationObserver): así no hay que tocar la lógica de cada
// pantalla y nada de lo que funciona se rompe. Solo traduce textos de la app que
// conoce (diccionario y reglas con números y nombres); tus datos (clientes,
// sitios, conceptos) no se tocan.
// No se traducen: el asistente de voz («Oye Rutivo» sigue en español), la factura
// (es bilingüe, ver facturas.js) ni lo que escribes en los campos.

const KEY = 'idioma';
export const LANGS = { es: { flag: '🇪🇸', label: 'Español', sub: 'Idioma de la app' }, en: { flag: '🇬🇧', label: 'English', sub: 'App language (the voice assistant stays in Spanish)' } };

export function lang() {
  try {
    return localStorage.getItem(KEY) === 'en' ? 'en' : 'es';
  } catch {
    return 'es';
  }
}
export const isEn = () => lang() === 'en';

export function setLang(l) {
  try { localStorage.setItem(KEY, l === 'en' ? 'en' : 'es'); } catch { /* sin almacenamiento */ }
}

// ---------- diccionario (texto exacto en español → inglés) ----------
const D = {
  // Pestañas y títulos
  'Caja': 'Cash', 'Transfer': 'Transfer', 'Gasolina': 'Fuel', 'Facturas': 'Invoices', 'Hucha': 'Savings', 'Cuenta': 'Account',
  // Panel Transfer y enlace para el cliente
  'Panel': 'Dashboard', 'Panel Transfer': 'Transfer dashboard', 'Por cobrar': 'To collect', '7 días': '7 days', 'servicios': 'services',
  'toca para cobrar': 'tap to collect', 'todo cobrado ✓': 'all collected ✓', 'PRÓXIMA RECOGIDA': 'NEXT PICKUP', 'AHORA': 'NOW',
  '🔗 Enviar enlace al cliente': '🔗 Send link to the client', 'Esta semana': 'This week', 'Te deben': 'Owed to you', 'Sin nombre de pasajero': 'No passenger name',
  'No tienes servicios próximos.': 'You have no upcoming services.', '🚖 Ir a Transfer': '🚖 Go to Transfer', '🔗 Enlace': '🔗 Link',
  'Apúntalos en Transfer (o pega el texto de la agencia) y aquí lo tendrás todo a mano.': 'Add them in Transfer (or paste the agency text) and you’ll have everything here.',
  'Idioma del cliente': 'Client language', 'Dónde le esperas': 'Where you wait', 'Tu coche': 'Your car', 'Matrícula': 'Number plate',
  'Tu teléfono (para que te escriba o te llame)': 'Your phone (so they can message or call you)', '📲 Enviárselo por WhatsApp': '📲 Send it by WhatsApp',
  '📋 Copiar enlace': '📋 Copy link', '👀 Ver lo que verá': '👀 See what they’ll see', 'Enlace copiado ✓': 'Link copied ✓',
  '📸 Foto del punto de encuentro': '📸 Meeting point photo', '⚠️ Esta foto es de antes y se ve borrosa. Toca «📷 Elegir foto» y vuelve a elegirla: ahora se guarda nítida.': '⚠️ This photo is from before and looks blurry. Tap «📷 Elegir foto» and choose it again: now it is saved sharp.', '🗑️ Quitar foto': '🗑️ Remove photo',
  'Caja diaria': 'Daily cash', 'Día a día': 'Day by day', 'Día': 'Day', 'Hoy': 'Today', 'Mañana': 'Tomorrow', 'Ahora': 'Now',
  'Ingresos': 'Income', 'Gastos': 'Expenses', 'Ingreso': 'Income', 'Gasto': 'Expense', 'Efectivo': 'Cash', 'Tarjeta': 'Card',
  'Servicios Transfer': 'Transfer services', 'Neto en efectivo': 'Net in cash', 'Neto con tarjeta': 'Net by card',
  'Km del mes': 'Km this month', 'Beneficio por km': 'Profit per km', 'Todos los meses': 'All months',
  'Balance del día': 'Day balance', 'Importe (€)': 'Amount (€)', 'Concepto': 'Description', 'Guardar movimiento': 'Save entry',
  'Movimientos del día': 'Today’s entries', 'Movimientos': 'Entries', 'Aún no hay movimientos este día. Añade el primero arriba.': 'No entries for this day yet. Add the first one above.',
  'Próximos servicios': 'Upcoming services', '📍 Llevarme': '📍 Take me there', '📍 Llevarme a la recogida': '📍 Take me to the pickup', '✈️ Ver vuelo': '✈️ See flight',
  'Tus datos se guardan en este dispositivo. Haz copias de seguridad desde Cuenta (arriba a la derecha) para no perderlos.': 'Your data is saved on this device. Make backups from Account (top right) so you don’t lose it.',
  'Haz una copia de seguridad': 'Make a backup', 'Más tarde': 'Later', 'Hacer copia ahora': 'Back up now',
  'Aún no has hecho ninguna copia. Si se borran los datos del navegador o pierdes el móvil, la copia es la única forma de recuperarlos.': 'You haven’t made a backup yet. If the browser data is cleared or you lose your phone, a backup is the only way to get it back.',
  'Aún no has hecho ninguna copia.': 'You haven’t made a backup yet.',
  'Si se borran los datos del navegador o pierdes el móvil, la copia es la única forma de recuperarlos.': 'If the browser data is cleared or you lose your phone, a backup is the only way to get it back.',
  'Instala Rutivo en tu móvil': 'Install Rutivo on your phone', 'Se abre como una app, funciona sin internet y el móvil no borra tus datos.': 'It opens like an app, works offline and your phone won’t delete your data.',
  'Añadir a pantalla de inicio': 'Add to Home Screen', 'Instalar app': 'Install app',
  // Jornada
  '🚖 Mi jornada': '🚖 My shift', 'Km al empezar': 'Km at start', 'Km al terminar': 'Km at end', 'Empecé': 'Started', 'Terminé': 'Finished',
  'Beneficio limpio del día': 'Net profit today', 'Km recorridos': 'Km driven', 'Horas trabajadas': 'Hours worked', 'Beneficio por hora': 'Profit per hour',
  '🏁 Cerrar el día': '🏁 Close the day', '🎯 Objetivo diario': '🎯 Daily goal', 'Quiero ganar limpio al día (€)': 'Daily net target (€)',
  'Los km al terminar deben ser mayores que al empezar.': 'End km must be higher than start km.', '🏆 ¡Tu mejor día del último mes!': '🏆 Your best day in the last month!',
  '🎯 Objetivo diario cumplido': '🎯 Daily goal reached', 'Hoy no hay ingresos apuntados. ¡Mañana más! 💪': 'No income recorded today. More tomorrow! 💪',
  '¡Gran día! A descansar, que te lo has ganado. 🚖✨': 'Great day! Get some rest, you’ve earned it. 🚖✨', 'Día flojo, pero cada día cuenta. ¡Mañana a por más! 💪': 'Slow day, but every day counts. Go for more tomorrow! 💪',
  '🖼️ Guardar imagen del día': '🖼️ Save image of the day', 'Imagen del día lista ✓': 'Image of the day ready ✓',
  // Transfer
  'Pegar servicio de la agencia': 'Paste the agency’s booking', 'Leer servicio': 'Read booking', '📷 Foto o vídeo': '📷 Photo or video',
  'Pega aquí el servicio tal como te llega (de cualquier app o agencia)': 'Paste the booking here exactly as you get it (from any app or agency)',
  '📷 Leer datos de una foto': '📷 Read details from a photo', 'Nombre o empresa': 'Name or company', 'NIF / CIF': 'Tax ID (NIF / CIF)', 'Dirección': 'Address',
  'Código postal': 'Postcode', 'Localidad': 'Town', 'Guardar proveedor': 'Save supplier', 'Actualizar proveedor': 'Update supplier', 'Fecha': 'Date', 'Hora': 'Time',
  'Proveedor': 'Supplier', 'Elegir proveedor…': 'Choose supplier…', 'Origen': 'From', 'Destino': 'To', 'Importe total (€, con IVA)': 'Total amount (€, VAT incl.)', 'Pago': 'Payment',
  'Pendiente': 'Pending', '💶 ¿Me compensa este servicio?': '💶 Is this job worth it?', 'Notas (equipaje, espera, peaje...)': 'Notes (luggage, waiting, tolls...)',
  'Pasajero y vuelo': 'Passenger and flight', 'Nombre del pasajero (cartel)': 'Passenger name (sign)', 'Vuelo': 'Flight', 'Salida del vuelo (hora origen)': 'Flight departure (origin time)',
  'Teléfono del pasajero': 'Passenger phone', 'Guardar servicio': 'Save service', 'Mensaje de bienvenida': 'Welcome message', 'Al tocar': 'When you tap',
  '💬 Bienvenida': '💬 Welcome', 'Mensaje en inglés (opcional)': 'Message in English (optional)', 'Mensaje en español (opcional)': 'Message in Spanish (optional)',
  'Así le llegará al cliente (ejemplo)': 'This is what the client will get (example)', 'Volver al mensaje original': 'Back to the original message',
  'en un servicio eliges entre varios mensajes preparados (cercano, formal, con cartel, corto, VIP) o este tuyo. Aquí escribes «El mío». Puedes usar: {nombre} (solo el nombre de pila) {chofer} (tu nombre) {punto} {vuelo} {hora} {destino} {fecha} {recogida} {ciudad}. Si un dato falta, esa frase no se envía.':
    'on a service you choose from several ready-made messages (friendly, formal, with sign, short, VIP) or your own. Write «Mine» here. You can use: {nombre} (first name only) {chofer} (your name) {punto} {vuelo} {hora} {destino} {fecha} {recogida} {ciudad}. If a detail is missing, that sentence isn’t sent.',
  'Servicios': 'Services', 'Sin facturar': 'Not invoiced', 'Cartel': 'Sign', '✈️ Vuelo': '✈️ Flight', 'Borrar todos los servicios': 'Delete all services',
  'Aún no hay servicios. Registra el primero arriba.': 'No services yet. Add the first one above.', 'Pendiente de cobro': 'Awaiting payment', 'Pendiente de cobro ▾': 'Awaiting payment ▾',
  'Cobrado: efectivo ▾': 'Paid: cash ▾', 'Cobrado: tarjeta ▾': 'Paid: card ▾', '💶 Cobrado en efectivo': '💶 Paid in cash', '💳 Cobrado con tarjeta': '💳 Paid by card', '⏳ Pendiente de cobro': '⏳ Awaiting payment',
  'A la recogida': 'To the pickup', 'Al destino': 'To the destination', 'No hay servicios que borrar.': 'There are no services to delete.', 'Servicios borrados.': 'Services deleted.',
  'Marcado como pendiente de cobro.': 'Marked as awaiting payment.', '✓ Añadido a la caja de hoy.': '✓ Added to today’s cash.', 'Proveedor guardado ✓': 'Supplier saved ✓',
  'Toca otra vez para borrar el proveedor.': 'Tap again to delete the supplier.', 'Proveedor borrado.': 'Supplier deleted.', 'Cartel guardado.': 'Sign saved.', 'Mensaje original restablecido.': 'Original message restored.',
  'No encuentro la fecha ni la hora. Revisa el texto o pega el servicio completo.': 'I can’t find the date or time. Check the text or paste the whole booking.',
  'Servicio leído. Elige el proveedor, revisa el importe y guarda.': 'Booking read. Choose the supplier, check the amount and save.',
  'No encuentro nombre, CIF ni dirección en la foto. Prueba con otra más nítida.': 'I can’t find a name, tax ID or address in the photo. Try a sharper one.',
  '✓ Datos leídos de la foto. Revísalos y toca «Guardar proveedor».': '✓ Details read from the photo. Check them and tap «Save supplier».',
  'No se pudo leer la foto (¿sin internet la primera vez?). Prueba otra vez.': 'Couldn’t read the photo (no internet the first time?). Try again.',
  'No he encontrado texto. Prueba con una captura más nítida.': 'I found no text. Try a sharper screenshot.',
  'He leído el texto (arriba), pero no encuentro la fecha ni la hora. Corrígelo y toca «Leer servicio».': 'I read the text (above) but can’t find the date or time. Fix it and tap «Read booking».',
  'No se pudo leer el archivo (¿sin internet la primera vez?). Prueba otra vez o pega el texto.': 'Couldn’t read the file (no internet the first time?). Try again or paste the text.',
  '🚖 Transfer programado': '🚖 Scheduled transfer', 'Entendido': 'Got it', 'Borrar': 'Delete', 'Editar': 'Edit',
  // Bienvenida
  'Estilo del mensaje': 'Message style', '😊 Cercano': '😊 Friendly', '👔 Formal': '👔 Formal', '🪧 Con cartel': '🪧 With sign', '⚡ Corto': '⚡ Short', '⭐ VIP': '⭐ VIP', '✏️ El mío': '✏️ Mine',
  'Idioma': 'Language', 'Español': 'Spanish', 'Inglés': 'English', 'Los dos': 'Both', 'Punto de encuentro': 'Meeting point', 'Mensaje (puedes cambiar lo que quieras)': 'Message (change anything you like)',
  '📲 Enviar por WhatsApp (elige el contacto)': '📲 Send by WhatsApp (choose the contact)', '📋 Copiar': '📋 Copy', '⭐ Usar siempre este': '⭐ Always use this one',
  'Ej.: el restaurante La Mano, llegadas…': 'E.g.: La Mano restaurant, arrivals…', 'Mensaje copiado ✓': 'Message copied ✓', 'No se pudo copiar. Mantén pulsado el texto y cópialo.': 'Couldn’t copy. Press and hold the text and copy it.',
  'A partir de ahora saldrá este estilo primero ✓': 'From now on this style will come first ✓', 'Pon tu nombre en Facturas → Mis datos de emisor y saldrá solo.': 'Add your name in Invoices → My issuer details and it will appear automatically.',
  // ¿Me compensa?
  '✅ Te compensa': '✅ Worth it', '🤔 Justo': '🤔 Borderline', '❌ No te compensa': '❌ Not worth it', 'No encuentro ruta': 'No route found', 'Comisión': 'Commission', 'Desgaste del coche': 'Car wear',
  'Precio (€)': 'Price (€)', 'Comisión (%)': 'Commission (%)', 'Peaje ida (€)': 'Toll one way (€)', 'Espera (min)': 'Waiting (min)', 'Consumo (L/100 km)': 'Consumption (L/100 km)',
  'Gasoil (€/L)': 'Diesel (€/L)', 'Desgaste (€/km)': 'Wear (€/km)', 'Mínimo €/hora': 'Minimum €/hour', 'Sin conexión para calcular la ruta ahora.': 'No connection to calculate the route right now.',
  'Desde': 'From', 'Hasta': 'To', 'Vuelvo en vacío (cuenta la vuelta)': 'Return empty (count the way back)', 'Mi coche': 'My car', 'Calcular': 'Calculate',
  // Gasolina
  'Gasolina del vehículo': 'Vehicle fuel', 'Gasolina de este mes': 'Fuel this month', 'Litros': 'Litres', 'Gasolinera': 'Petrol station',
  '📷 Foto o PDF del ticket (rellena los datos solo)': '📷 Receipt photo or PDF (fills in the details)', 'Guardar factura de gasolina': 'Save fuel receipt',
  '📤 Tickets para el gestor': '📤 Receipts for your accountant', 'Junta todas las facturas de gasolina en un solo PDF: primero la lista con el total y luego cada ticket en su página.': 'Puts all fuel receipts in one PDF: first the list with the total, then each receipt on its own page.',
  'Periodo': 'Period', 'Este mes': 'This month', 'Mes pasado': 'Last month', 'Este trimestre': 'This quarter', 'Trimestre pasado': 'Last quarter', 'Este año': 'This year', 'Todas': 'All', 'Elegir fechas…': 'Choose dates…',
  'Todas con foto del ticket.': 'All with a receipt photo.', '📄 Crear PDF con todos los tickets': '📄 Create PDF with all receipts', 'Facturas guardadas': 'Saved receipts', 'Ver factura': 'See receipt',
  'Aún no hay facturas de gasolina. Guarda la primera arriba con su foto.': 'No fuel receipts yet. Save the first one above with its photo.', 'No hay facturas de gasolina en ese periodo.': 'No fuel receipts in that period.',
  '🔎 Leyendo el ticket… (la primera vez tarda un poco más)': '🔎 Reading the receipt… (the first time takes a bit longer)', 'No he podido leer los datos. Escríbelos a mano.': 'I couldn’t read the details. Type them in.',
  'No se pudo leer el ticket (¿sin conexión?). Escribe los datos a mano.': 'Couldn’t read the receipt (offline?). Type the details in.', 'Preparando…': 'Preparing…', 'Preparando tickets': 'Preparing receipts',
  'No se pudo guardar el archivo (falta espacio o el formato no es válido). La factura se guarda sin archivo.': 'Couldn’t save the file (no space or invalid format). The receipt is saved without the file.',
  // Hucha
  '＋ Nueva': '＋ New', '＋ Otra cantidad': '＋ Other amount', '➖ Sacar': '➖ Take out', 'Mete algo hoy para no perder la racha.': 'Put something in today to keep your streak.',
  'Ahorrado cada mes': 'Saved each month', '✏️ Editar esta hucha': '✏️ Edit this jar', 'Nombre': 'Name', 'Icono': 'Icon', 'Meta (€)': 'Goal (€)', 'Fecha límite (opcional)': 'Deadline (optional)',
  'Cada día meto (si no hay fecha límite)': 'I put in each day (if there’s no deadline)', 'Guardar cambios': 'Save changes', 'Borrar esta hucha': 'Delete this jar', 'Vacaciones, ruedas nuevas…': 'Holidays, new tyres…',
  '🎉 ¡Meta conseguida!': '🎉 Goal reached!', 'Mete un poco cada día y verás cuándo llegas.': 'Put a little in every day and you’ll see when you get there.', 'Empieza tu racha hoy': 'Start your streak today',
  '¡Hoy ya has metido! Sigue así.': 'You’ve already saved today! Keep it up.', 'Mete algo cada día y sube la racha.': 'Save something every day to grow your streak.', 'Ponle un nombre a la hucha.': 'Give the jar a name.',
  'Escribe la meta en euros.': 'Write the goal in euros.', 'Escribe un importe.': 'Write an amount.', '＋ Nueva hucha': '＋ New jar', 'Cambios guardados ✓': 'Changes saved ✓',
  'Es tu única hucha. Cámbiale el nombre o la meta en vez de borrarla.': 'It’s your only jar. Change its name or goal instead of deleting it.', 'Hucha borrada': 'Jar deleted', 'Mi hucha': 'My jar', '🐷 Mi hucha': '🐷 My jar',
  '🏖️ Vacaciones': '🏖️ Holidays',
  // Facturas
  'Mis datos de emisor': 'My issuer details', 'NIF / DNI': 'Tax ID (NIF / DNI)', 'Licencia o matrícula (opcional)': 'Licence or number plate (optional)', 'Dirección (calle y número)': 'Address (street and number)',
  'Número de cuenta (IBAN)': 'Bank account (IBAN)', 'Última factura emitida (nº)': 'Last invoice issued (no.)', 'IVA (%)': 'VAT (%)', 'Motivo de que no lleve IVA (obligatorio con IVA 0)': 'Reason for no VAT (required with 0% VAT)',
  'Email de tu gestor (opcional)': 'Your accountant’s email (optional)', 'Tu nombre en el mensaje de bienvenida (opcional)': 'Your name in the welcome message (optional)', 'Punto de encuentro habitual (opcional)': 'Usual meeting point (optional)',
  '🧾 Crear facturas (extra opcional)': '🧾 Create invoices (optional extra)', 'No hace falta para usar Rutivo. Actívalo solo si quieres hacer facturas desde la app; si no, puedes seguir haciéndolas como siempre.': 'You don’t need it to use Rutivo. Turn it on only if you want to make invoices in the app; otherwise keep doing them as usual.',
  'Activar facturas': 'Turn on invoices', 'Cliente a facturar': 'Client to invoice', 'Es un particular (sin NIF)': 'Private individual (no tax ID)', 'NIF del cliente': 'Client tax ID', 'Dirección del cliente': 'Client address',
  'Servicios sin facturar': 'Services not invoiced', 'Crear factura': 'Create invoice', '📊 Trimestres e impuestos': '📊 Quarters and taxes',
  'Lo facturado en cada trimestre, la base, el IVA y los gastos. Desde aquí se lo mandas a tu gestor.': 'What you billed each quarter, the tax base, VAT and expenses. Send it to your accountant from here.',
  'Has facturado': 'You’ve billed', 'En tarjeta': 'By card', 'En efectivo': 'In cash', 'Base sin IVA': 'Base excl. VAT', '📤 Enviar este trimestre a mi gestor': '📤 Send this quarter to my accountant',
  'Facturas emitidas': 'Invoices issued', '⬇️ Descargar lista de facturas': '⬇️ Download invoice list', 'Ocultar «Crear facturas»': 'Hide «Create invoices»', 'Todavía no has emitido facturas.': 'You haven’t issued any invoices yet.',
  'Sin servicios pendientes': 'No services to invoice', 'Facturas sin sincronizar con tu cuenta': 'Invoices not synced with your account', 'Marca al menos un servicio para facturar.': 'Select at least one service to invoice.',
  'Crear igualmente': 'Create anyway', '¿Borrar?': 'Delete?', 'Toca otra vez para borrar la factura.': 'Tap again to delete the invoice.', 'Factura borrada. Sus servicios vuelven a «Sin facturar».': 'Invoice deleted. Its services go back to «Not invoiced».',
  '¿Anular?': 'Cancel it?', 'Toca otra vez: se creará una factura rectificativa que la anula.': 'Tap again: a corrective invoice will be created to cancel it.',
  'Rutivo te prepara la factura con tus datos. Revísala antes de enviarla: su contenido es responsabilidad de quien la emite.': 'Rutivo prepares the invoice with your details. Check it before sending: its content is the issuer’s responsibility.',
  'Preparando PDF…': 'Preparing PDF…', 'PDF listo ✓': 'PDF ready ✓', 'No se pudo crear el PDF. Revisa la conexión e inténtalo otra vez.': 'Couldn’t create the PDF. Check your connection and try again.',
  '«Crear facturas» oculto. Tus facturas siguen guardadas.': '«Create invoices» hidden. Your invoices are still saved.', 'Cerrar': 'Close', 'Anular': 'Cancel invoice', 'Enviar / guardar PDF': 'Send / save PDF',
  'Comprobando el último número en tu cuenta…': 'Checking the latest number in your account…',
  'Sin conexión: se usa el último número de este móvil. Si otro móvil emitió a la vez, te avisaré.': 'Offline: using this phone\u2019s latest number. If another phone issued one at the same time, I\u2019ll let you know.',
  '⚠️ Hay facturas con el número repetido': '⚠️ Some invoices have a repeated number', '⚠️ Número repetido': '⚠️ Repeated number',
  'Abre la más reciente, toca «Anular» y vuelve a emitirla: tendrá un número nuevo. Las facturas no se pueden borrar ni cambiar de número.': 'Open the most recent one, tap «Cancel invoice» and issue it again: it will get a new number. Invoices can\u2019t be deleted or renumbered.',
  // Cuenta
  '‹ Volver': '‹ Back', 'Este dispositivo': 'This device', 'Tus datos se guardan solo en este móvil. Haz copias de seguridad.': 'Your data is only saved on this phone. Make backups.',
  'Apariencia': 'Appearance', 'Elegante': 'Elegant', 'Azul marino, sobrio': 'Navy blue, understated', 'Clásico': 'Classic', 'Claro (oscuro si el móvil está en modo oscuro)': 'Light (dark if your phone is in dark mode)',
  'Avisos': 'Notifications', '🚗 «Sal ya» con el vuelo en directo, la bienvenida y la hucha. Llegan aunque tengas la app cerrada.': '🚗 «Leave now» with the live flight, the welcome message and savings. They arrive even with the app closed.',
  'Activar avisos': 'Turn on notifications', 'Mi logo': 'My logo', '🎨 Cambiar mi logo': '🎨 Change my logo', 'Así se ve en la app y en tus facturas. Puedes cambiarlo cuando quieras.': 'This is how it looks in the app and on your invoices. Change it whenever you like.',
  'Tipo de logo': 'Logo type', 'Iniciales': 'Initials', 'Mi imagen': 'My image', 'Solo texto': 'Text only', 'Forma': 'Shape', 'Círculo': 'Circle', 'Cuadrado': 'Square', 'Elige tu icono': 'Choose your icon',
  'Sube tu imagen o logo': 'Upload your image or logo', 'Quitar imagen': 'Remove image', 'Color': 'Colour', 'Texto del logo (si lo dejas vacío, tu nombre)': 'Logo text (if empty, your name)',
  'Segunda línea del logo (opcional)': 'Logo second line (optional)', 'Tercera línea del logo (opcional)': 'Logo third line (optional)', 'Volver al logo por defecto': 'Back to the default logo',
  'Copia de seguridad': 'Backup', 'Exportar copia': 'Export backup', 'Descarga un archivo con todos tus datos': 'Download a file with all your data', 'Importar copia': 'Import backup',
  'Recupera tus datos desde un archivo': 'Restore your data from a file', 'Copiar como texto': 'Copy as text', 'Alternativa si no puedes usar archivos': 'Alternative if you can’t use files',
  'Copiar mis datos': 'Copy my data', 'Restaurar': 'Restore', 'La copia incluye caja, servicios, facturas, gasolina, hucha y tus datos de emisor. No incluye las fotos de los tickets.': 'The backup includes cash, services, invoices, fuel, savings and your issuer details. It doesn’t include receipt photos.',
  'La copia en archivo incluye caja, servicios, facturas, gasolina (con las fotos de los tickets), hucha y tus datos de emisor. «Copiar como texto» no lleva las fotos.': 'The backup file includes cash, services, invoices, fuel (with receipt photos), savings and your issuer details. «Copy as text» doesn\u2019t include the photos.',
  'Aquí aparece tu copia, o pega aquí una copia para restaurarla': 'Your backup appears here, or paste a backup here to restore it',
  'Legal': 'Legal', 'Condiciones, privacidad y aviso legal': 'Terms, privacy and legal notice (in Spanish)', 'Licencia': 'Licence',
  'Prohibida su copia, modificación o distribución sin autorización.': 'Copying, modification or distribution without permission is prohibited.',
  'Crear cuenta': 'Create account', 'Entrar': 'Sign in', 'Contraseña': 'Password', 'Repite la contraseña': 'Repeat the password', '¿Has olvidado tu contraseña?': 'Forgot your password?',
  'Escribe tu email.': 'Enter your email.', 'Escribe tu contraseña.': 'Enter your password.', 'Las contraseñas no coinciden.': 'The passwords don’t match.',
  'La contraseña debe tener al menos 8 caracteres.': 'The password must have at least 8 characters.', 'La contraseña debe tener al menos 6 caracteres.': 'The password must have at least 6 characters.',
  'La contraseña debe tener letras y números.': 'The password must have letters and numbers.', 'La contraseña no puede contener tu email.': 'The password can’t contain your email.', 'Esa contraseña es demasiado fácil. Elige otra.': 'That password is too easy. Choose another.',
  'Crea tu cuenta para guardar tus datos en la nube. Lo que ya tienes en este móvil se añadirá a tu cuenta.': 'Create your account to save your data in the cloud. What you already have on this phone will be added to your account.',
  'Entra en tu cuenta o créala gratis. Tus datos se guardan en la nube y los recuperas en cualquier móvil.': 'Sign in or create a free account. Your data is saved in the cloud and you get it back on any phone.',
  'Para crear la cuenta, acepta las condiciones de uso y la política de privacidad.': 'To create the account, accept the terms of use and the privacy policy.', 'Sin conexión. Revisa internet e inténtalo otra vez.': 'No connection. Check the internet and try again.',
  'Escribe tu email arriba y vuelve a tocar aquí.': 'Enter your email above and tap here again.', 'Te hemos enviado un email para cambiar la contraseña. Mira también en spam.': 'We’ve sent you an email to change your password. Check your spam folder too.',
  'Sin conexión': 'Offline', 'Trabajando con los datos de este móvil. Se sincronizarán al volver internet.': 'Working with this phone’s data. It will sync when the internet is back.',
  'Cerrar sesión': 'Sign out', 'Tus datos seguirán guardados en tu cuenta': 'Your data will stay saved in your account', 'Eliminar cuenta': 'Delete account',
  'Esta acción no se puede deshacer. Si quieres conservarlos, exporta antes una copia.': 'This can’t be undone. If you want to keep your data, export a backup first.',
  'Enviado ✓. Revisa tu correo (y spam).': 'Sent ✓. Check your email (and spam).', 'Email confirmado ✓': 'Email confirmed ✓', 'Aún no consta como confirmado. Abre el enlace del email y vuelve a tocar.': 'Not confirmed yet. Open the link in the email and tap again.',
  'Sin conexión. Inténtalo en un momento.': 'Offline. Try again in a moment.', 'Toca otra vez para confirmar': 'Tap again to confirm', 'Cuenta borrada.': 'Account deleted.',
  'Cambios sin subir. Toca otra vez para salir igualmente': 'Unsaved changes. Tap again to sign out anyway', 'Cerrando sesión…': 'Signing out…', 'Toca otra vez para cerrar sesión': 'Tap again to sign out',
  'Al salir se borran los datos de este móvil; seguirán en tu cuenta.': 'Signing out removes the data from this phone; it stays in your account.', 'No se pudo cerrar sesión. Revisa la conexión.': 'Couldn’t sign out. Check your connection.',
  'Conectando con tu cuenta…': 'Connecting to your account…', 'Sin conexión: trabajando con los datos de este móvil.': 'Offline: working with this phone’s data.',
  'Sin conexión con tu cuenta: los datos están solo en este móvil.': 'No connection to your account: the data is only on this phone.', 'Sincronización': 'Sync', 'Entendido, borrar estos avisos': 'Got it, clear these notices',
  'Datos actualizados desde tu cuenta ✓': 'Data updated from your account ✓', 'Sin conexión: los cambios están en este móvil y se subirán al volver internet.': 'Offline: your changes are on this phone and will upload when the internet is back.',
  'Datos guardados en tu cuenta ✓': 'Data saved to your account ✓', 'Cuenta conectada. Aquí se guardarán tus datos ✓': 'Account connected. Your data will be saved here ✓',
  'Sin conexión con tu cuenta: trabajando con los datos de este móvil.': 'No connection to your account: working with this phone’s data.',
  '⚠️ Tu sesión ha caducado: no se pudo guardar en tu cuenta. Vuelve a entrar; tus datos siguen en este móvil.': '⚠️ Your session has expired: couldn’t save to your account. Sign in again; your data is still on this phone.',
  '⚠️ No se pudo guardar ahora (servicio saturado). Se reintentará; tus datos siguen en este móvil.': '⚠️ Couldn’t save now (service busy). It will retry; your data is still on this phone.',
  // Copias
  'Copia hecha. Pégala donde quieras restaurarla.': 'Backup made. Paste it where you want to restore it.', 'Mantén pulsado el texto de la caja, elige Copiar y pégalo en el otro sitio.': 'Press and hold the text in the box, choose Copy and paste it in the other place.',
  'Datos restaurados.': 'Data restored.', 'Se restauraron, pero no se pudieron guardar en este dispositivo.': 'Restored, but couldn’t be saved on this device.', 'La copia no es válida. Pégala completa en la caja.': 'The backup isn’t valid. Paste it complete in the box.',
  'Esto sustituye los datos de este dispositivo.': 'This replaces the data on this device.', 'Copia guardada ✓ Guárdala en un sitio seguro.': 'Backup saved ✓ Keep it somewhere safe.', 'Ese archivo no es una copia de Rutivo.': 'That file isn’t a Rutivo backup.',
  'Toca otra vez para restaurar (sustituye tus datos)': 'Tap again to restore (replaces your data)', 'Esto sustituye los datos actuales por los de la copia.': 'This replaces your current data with the backup.',
  'Imagen guardada ✓': 'Image saved ✓', 'No se pudo leer la imagen.': 'Couldn’t read the image.', 'Toca otra vez para volver al logo por defecto': 'Tap again to go back to the default logo', 'Logo por defecto restablecido ✓': 'Default logo restored ✓', 'Imagen quitada.': 'Image removed.',
  // Avisos (notificaciones y ajustes)
  '🚗 ¡Sal ya!': '🚗 Leave now!', 'Mandar bienvenida': 'Send welcome', 'Recuerda meter hoy en la hucha': 'Remember to save in your jar today', '☀️ Empieza un nuevo día': '☀️ A new day begins',
  'Apunta la hora de inicio y los km del coche en Rutivo.': 'Record your start time and the car’s km in Rutivo.', '📝 No olvides apuntar lo de hoy': '📝 Don’t forget to record today',
  'Tus gastos e ingresos del día, y los km al terminar. Un minuto y lo tienes al día.': 'Today’s expenses and income, and the km at the end. One minute and you’re up to date.',
  'Estar en llegadas … min después de aterrizar': 'Be at arrivals … min after landing', 'En otras recogidas, llegar … min antes': 'For other pickups, arrive … min early', 'Colchón extra (min)': 'Extra buffer (min)',
  'Camino si no sé dónde estás (min)': 'Travel time if I don’t know where you are (min)', 'Avisos desactivados.': 'Notifications off.', 'Activados. Añade Rutivo a la pantalla de inicio para recibirlos con la app cerrada.': 'On. Add Rutivo to your Home Screen to get them with the app closed.',
  'Avisos activados ✓': 'Notifications on ✓', 'Activando…': 'Turning on…', '🔔 Listo: te ha llegado una notificación de prueba.': '🔔 Done: a test notification has arrived.', 'Notificaciones bloqueadas.': 'Notifications blocked.',
  'Ajustes → Notificaciones → Rutivo → Permitir.': 'Settings → Notifications → Rutivo → Allow.', 'Permítelas en los ajustes del navegador.': 'Allow them in your browser settings.', 'No he podido activarlos ahora. Inténtalo en un momento.': 'I couldn’t turn them on now. Try again in a moment.',
  'Avisarme de cuándo salir': 'Tell me when to leave', 'Avisarme cada día': 'Remind me every day',
  // Vuelos
  'Ver en Flightradar24': 'See on Flightradar24', 'Buscando el avión…': 'Looking for the plane…', 'En tierra': 'On the ground', 'Sin datos': 'No data', 'Puerta cerrada': 'Gate closed', 'Ha despegado': 'Departed',
  'En vuelo': 'In flight', 'Aproximándose': 'Approaching', 'Ha llegado': 'Arrived', 'Ha aterrizado': 'Landed', 'Posiblemente cancelado': 'Possibly cancelled', '🕒 Posición ESTIMADA por horario': '🕒 ESTIMATED position from the schedule',
  // Legal (pantalla de aceptación)
  'Condiciones de uso': 'Terms of use', 'Política de privacidad': 'Privacy policy', 'He leído y acepto': 'I have read and accept',
  // Logo e iconos
  'Taxi': 'Taxi', 'Coche': 'Car', 'Furgoneta': 'Van', 'Minibús': 'Minibus', 'Maletas': 'Luggage', 'Aeropuerto': 'Airport', 'Estrella': 'Star', 'Corona': 'Crown', 'Rayo': 'Lightning', 'Corazón': 'Heart',
  'Sol': 'Sun', 'Ancla': 'Anchor', 'Montaña': 'Mountain', 'Olas': 'Waves', 'Volante': 'Steering wheel', 'Brújula': 'Compass', 'Casa': 'House', 'Cohete': 'Rocket', 'Llave': 'Key',
  'azul': 'blue', 'verde': 'green', 'rojo': 'red', 'naranja': 'orange', 'morado': 'purple', 'negro': 'black', 'Tu negocio': 'Your business',
  'Ej.: gasolina, peaje, propina': 'E.g.: fuel, toll, tip', 'Ej.: Operación exenta, art. 20 Ley del IVA': 'E.g.: Exempt transaction, art. 20 VAT Act', 'Si lo dejas vacío, se usa tu nombre de pila': 'If left empty, your first name is used',
  'Ej.: llegadas, puerta 3': 'E.g.: arrivals, door 3', 'Ej.: Taxi Sol': 'E.g.: Taxi Sol', 'Ej.: Servicio de transfers': 'E.g.: Transfer service', 'Ej.: Málaga': 'E.g.: Málaga', 'Hablar con Rutivo': 'Talk to Rutivo',
  'Rutivo no se puede abrir dentro de otra página': 'Rutivo can’t be opened inside another page',
  // PDF de gasolina
  'Facturas de gasolina': 'Fuel receipts', 'Nº': 'No.', 'Importe': 'Amount',
  'Cada ticket va en las páginas siguientes, en el mismo orden (Nº).': 'Each receipt is on the following pages, in the same order (No.).',
  'Ninguna factura de este periodo tiene foto guardada.': 'No receipt in this period has a saved photo.', 'La foto de este ticket no está en este móvil ni en la cuenta.': 'The photo of this receipt isn\u2019t on this phone or in the account.',
  'Todas las facturas guardadas': 'All saved receipts',
  // Avisos con la app cerrada
  'Pasajero': 'Passenger',
  // Voz (avisos fuera del asistente)
  '👆 Toca la pantalla para que «Oye Rutivo» te escuche': '👆 Tap the screen so «Oye Rutivo» can hear you', 'Nueva versión · Actualizar': 'New version · Update', '✨ Nueva versión · Actualizar': '✨ New version · Update',
};

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = { Ene: 'Jan', Feb: 'Feb', Mar: 'Mar', Abr: 'Apr', May: 'May', Jun: 'Jun', Jul: 'Jul', Ago: 'Aug', Sep: 'Sep', Oct: 'Oct', Nov: 'Nov', Dic: 'Dec' };
for (const [k, v] of Object.entries(SHORT)) D[k] = v;
const month = (m) => { const i = MONTHS.indexOf(m.toLowerCase()); return i < 0 ? m : MONTHS_EN[i]; };
const M = '(' + MONTHS.join('|') + ')';
for (const m of MONTHS) { D[m[0].toUpperCase() + m.slice(1)] = month(m); }
const DAYS = { lunes: 'Monday', martes: 'Tuesday', miércoles: 'Wednesday', jueves: 'Thursday', viernes: 'Friday', sábado: 'Saturday', domingo: 'Sunday' };

// ---------- reglas (textos con números, fechas o nombres) ----------
const R = [
  [/^Hoy (\d{1,2}:\d\d)$/, 'Today $1'], [/^Mañana (\d{1,2}:\d\d)$/, 'Tomorrow $1'],
  [new RegExp('^' + M + ' (\\d{4}): lo que llevas$', 'i'), (_, m, y) => month(m) + ' ' + y + ': so far'],
  [new RegExp('^' + M + ' (\\d{4})$', 'i'), (_, m, y) => month(m) + ' ' + y],
  [new RegExp('^' + M + ' · (\\d+) días? con ahorro$', 'i'), (_, m, n) => month(m) + ' · ' + n + ' day' + (n === '1' ? '' : 's') + ' saving'],
  [/^(.+) ingresos · (.+) gastos · (\d+) servicios?$/, (_, a, b, n) => a + ' income · ' + b + ' expenses · ' + n + ' service' + (n === '1' ? '' : 's')],
  [/^(\d+) facturas? · ([\d.,]+) litros$/, (_, n, l) => n + ' receipt' + (n === '1' ? '' : 's') + ' · ' + l + ' litres'],
  [/^(\d+) facturas? · (.+)$/, (_, n, v) => n + ' receipt' + (n === '1' ? '' : 's') + ' · ' + v],
  [/^en (\d+) h (\d+) min$/, 'in $1 h $2 min'], [/^en (\d+) min$/, 'in $1 min'], [/^en (\d+) h$/, 'in $1 h'],
  [/^🚗 Sal a las (\d{1,2}:\d\d) \(en (.+?)\) · (\d+) min de camino$/, (_, h, e, m) => '🚗 Leave at ' + h + ' (in ' + e.replace(/ min$/, ' min') + ') · ' + m + ' min drive'],
  [/^🚗 Sal a las (\d{1,2}:\d\d) · (\d+) min de camino$/, '🚗 Leave at $1 · $2 min drive'],
  [/^🚗 ¡Sal ya! \((\d+) min de camino\)$/, '🚗 Leave now! ($1 min drive)'], [/^🚗 Sal en (\d+) min$/, '🚗 Leave in $1 min'],
  [/^🎯 Objetivo: (.+) de (.+) · ¡Conseguido! 🎉$/, '🎯 Goal: $1 of $2 · Achieved! 🎉'], [/^🎯 Objetivo: (.+) de (.+)$/, '🎯 Goal: $1 of $2'],
  [/^Proveedores \((\d+)\)$/, 'Suppliers ($1)'], [/^Ver todos \((\d+)\)$/, 'See all ($1)'], [/^IVA \((\d+)%\)$/, 'VAT ($1%)'],
  [/^Aceptadas el (.+)$/, 'Accepted on $1'], [/^de (.+) ·$/, 'of $1 ·'], [/^· te faltan (.+)$/, '· $1 to go'], [/^🎯 Meta el (.+) · mete$/, '🎯 Goal by $1 · save'],
  [/^al día y llegas$/, 'a day to make it'], [/^A tu ritmo actual llegarías el (.+), un poco tarde\.$/, 'At your current pace you’d get there on $1, a bit late.'],
  [/^📈 A este ritmo llegas el (.+)\.?$/, '📈 At this pace you’ll get there on $1'],
  [/^🪙 Meter hoy (.+)$/, '🪙 Save today $1'], [/^(\d+) días? seguidos?$/, (_, n) => n + ' day' + (n === '1' ? '' : 's') + ' in a row'],
  [/^Metido en «(.+)»(.*)$/, 'Saved in «$1»$2'], [/^Sacado de «(.+)»(.*)$/, 'Taken out of «$1»$2'], [/^Hucha «(.+)» creada ✓$/, 'Jar «$1» created ✓'],
  [/^Toca otra vez para borrar «(.+)» y sus movimientos$/, 'Tap again to delete «$1» and its entries'], [/^➖ Sacar de (.+)$/, '➖ Take out of $1'], [/^＋ Meter en (.+)$/, '＋ Save in $1'],
  [/^Llega a las (\d{1,2}:\d\d)$/, 'Arrives at $1'], [/^Sale a las (\d{1,2}:\d\d)$/, 'Departs at $1'], [/^Aterrizó a las (\d{1,2}:\d\d)$/, 'Landed at $1'], [/^Despegó a las (\d{1,2}:\d\d)$/, 'Departed at $1'],
  [/^Programado (\d{1,2}:\d\d)(.*)$/, 'Scheduled $1$2'], [/^· En vuelo$/, '· In flight'], [/^· (Sin datos|Puerta cerrada|Ha despegado|Aproximándose|Ha llegado|Ha aterrizado|En tierra)$/, (_, s) => '· ' + D[s]],
  [/^✈️ En el aire · llega (\d{1,2}:\d\d)(.*)$/, '✈️ In the air · lands $1$2'], [/^(.+) · ✈️ En el aire · llega (\d{1,2}:\d\d)(.*)$/, '$1 · ✈️ In the air · lands $2$3'], [/^✈️ Llega (\d{1,2}:\d\d)(.*)$/, '✈️ Lands $1$2'],
  [/^🛬 Aterrizó hacia las (\d{1,2}:\d\d)(.*)$/, '🛬 Landed around $1$2'],
  [/^Salida prevista a las (\d{1,2}:\d\d)(?: \(programada (\d{1,2}:\d\d)\))? \(hora de aquí\)$/, (_, a, b) => 'Expected departure ' + a + (b ? ' (scheduled ' + b + ')' : '') + ' (local time)'],
  [/^📡 El seguimiento en directo y el mapa se activan al despegar \((\d{1,2}:\d\d)\)\.$/, '📡 Live tracking and the map start at take-off ($1).'],
  [/^✈️ Vuelo (\S+)$/, '✈️ Flight $1'], [/^💬 Bienvenida para (.+)$/, '💬 Welcome for $1'], [/^De (.+), tu nombre de la cuenta\.$/, 'From $1, your account name.'],
  [/^Pasajero: (.+)$/, (_, r) => 'Passenger: ' + r.replace(/ · Vuelo /, ' · Flight ')],
  [/^Recoges a (.+)$/, 'You pick up $1'], [/^Recogida en (?!\d+ min$)(.+)$/, 'Pickup at $1'], [/^Cobrado en (.+)$/, 'Paid by $1'],
  [/^(\d+) servicios? sin facturar$/, (_, n) => n + ' service' + (n === '1' ? '' : 's') + ' not invoiced'],
  [/^Toca otra vez: se borran (\d+) servicios?\.?$/, (_, n) => 'Tap again: ' + n + ' service' + (n === '1' ? '' : 's') + ' will be deleted'],
  [/^Ojo, falta: (.+)\. Puedes completarlo o tocar «Crear igualmente»\.$/, 'Careful, missing: $1. Complete it or tap «Create anyway».'],
  [/^Factura (\S+) anulada con la rectificativa (\S+)\. Sus servicios vuelven a «Sin facturar»\.$/, 'Invoice $1 cancelled with corrective invoice $2. Its services go back to «Not invoiced».'],
  [/^✓ Leído: (.+)$/, '✓ Read: $1'], [/^PDF descargado: (.+)$/, 'PDF downloaded: $1'], [/^Archivos descargados: (.+)$/, 'Files downloaded: $1'],
  [/^Tu última copia es de hace (\d+) días\.$/, 'Your last backup was $1 days ago.'],
  [/^¡Buena jornada! 🚖 Empiezas a las (\d{1,2}:\d\d)(.*)$/, 'Have a good shift! 🚖 You start at $1$2'], [/^Jornada terminada a las (\d{1,2}:\d\d)(.*)$/, 'Shift finished at $1$2'],
  [/^Cierre del (\w+) (.+)$/, (_, d, r) => 'Day close · ' + (DAYS[d] || d) + ' ' + r], [/^(.+) de beneficio limpio$/, '$1 net profit'],
  [/^⚠️ No se pudo sincronizar la factura (\S+) \((.+), demasiado grande\)\. Sigue guardada en este móvil\.$/, '⚠️ Couldn’t sync invoice $1 ($2, too large). It’s still saved on this phone.'],
  [/^⚠️ No se pudo guardar «(.+)» en tu cuenta \(permiso denegado\)\. Tus datos siguen en este móvil; cierra sesión y vuelve a entrar\.$/, '⚠️ Couldn’t save «$1» to your account (permission denied). Your data is still on this phone; sign out and sign in again.'],
  [/^⚠️ No se pudo guardar «(.+)» en tu cuenta\. Se reintentará; tus datos siguen en este móvil\.$/, '⚠️ Couldn’t save «$1» to your account. It will retry; your data is still on this phone.'],
  [/^🔀 Cambios de otro móvil juntados\.(.*)$/, (_, r) => '🔀 Changes from another phone merged.' + r.replace(/ (\d+) cambiado\(s\) en los dos: se ha quedado lo de este móvil \(detalle en Cuenta\)\./, ' $1 changed on both: this phone’s version was kept (details in Account).')],
  [/^⬇️ Preparando «Oye Rutivo»… (\d+)% \(solo la primera vez\)$/, '⬇️ Preparing «Oye Rutivo»… $1% (first time only)'],
  [/^(\d\d\/\d\d\/\d{4} \d{1,2}:\d\d) · (.+) a (.+)$/, '$1 · $2 to $3'],
  [/^Rutivo · © (.+)\. Todos los derechos reservados\.$/, 'Rutivo · © $1. All rights reserved.'],
  [/^Nº (\S+): (\d+) facturas \(se hicieron a la vez en dos móviles sin conexión\)\.$/, 'No. $1: $2 invoices (made at the same time on two offline phones).'],
  [/^Recogida en (\d+) min$/, 'Pickup in $1 min'],
  [/^🚗 ¡Sal ya! Recoges a (.+)$/, '🚗 Leave now! You pick up $1'],
  [/^(.+) · vuelo (\S*) sale a las (\d{1,2}:\d\d)$/, '$1 · flight $2 departs at $3'],
  [/^(.+) · (.+) a las (\d{1,2}:\d\d)$/, '$1 · $2 at $3'],
  [/^Total · (\d+) facturas? · (.+)$/, (_, n, l) => 'Total · ' + n + ' receipt' + (n === '1' ? '' : 's') + ' · ' + l],
  [/^Nº (\d+) · (.+)$/, (_, n, r) => 'No. ' + n + ' · ' + r.replace(/ · Gasolinera · /, ' · Petrol station · ').replace(/ · (Tarjeta|Efectivo)$/, (m, p) => ' · ' + D[p])],
  [/^(.+)  \(sin foto\)$/, '$1  (no photo)'],
  [/^Rutivo · página (\d+) de (\d+)$/, 'Rutivo · page $1 of $2'],
  [/^Del (\S+) al (\S+)$/, 'From $1 to $2'],
  [/^(\d+) min$/, '$1 min'],
];

/** Traduce un texto de la app (o lo devuelve igual si no es de la app). */
export function tr(text) {
  if (!isEn() || text == null) return text;
  const s = String(text);
  const k = s.replace(/\s+/g, ' ').trim();
  if (!k) return s;
  let out = D[k];
  if (out === undefined) {
    for (const [re, rep] of R) {
      if (re.test(k)) { out = k.replace(re, rep); break; }
    }
  }
  if (out === undefined) return s;
  // Conserva los espacios de alrededor (importan entre trozos de texto)
  const lead = s.match(/^\s*/)[0];
  const trail = s.match(/\s*$/)[0];
  return lead + out + trail;
}

// ---------- traductor de pantalla ----------
const SKIP = '.siri, .hf, #sheet, script, style, [translate="no"]'; // #sheet: la hoja de factura (bilingüe, ver facturas.js)
const ATTRS = ['placeholder', 'aria-label', 'title'];

function translateNode(n) {
  if (n.nodeType === 3) {
    const p = n.parentElement;
    if (!p || p.closest(SKIP)) return;
    const v = n.nodeValue;
    const t = tr(v);
    if (t !== v) n.nodeValue = t;
    return;
  }
  if (n.nodeType !== 1 || n.closest(SKIP)) return;
  for (const a of ATTRS) {
    if (n.hasAttribute(a)) { const v = n.getAttribute(a); const t = tr(v); if (t !== v) n.setAttribute(a, t); }
  }
  const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let x = w.nextNode(); x; x = w.nextNode()) {
    if (x.nodeType === 1) {
      if (x.matches(SKIP)) continue;
      for (const a of ATTRS) {
        if (x.hasAttribute(a)) { const v = x.getAttribute(a); const t = tr(v); if (t !== v) x.setAttribute(a, t); }
      }
    } else translateNode(x);
  }
}

/** Arranca el idioma: en inglés, traduce lo que hay y todo lo que vaya apareciendo. */
export function initI18n() {
  document.documentElement.lang = lang();
  if (!isEn()) return;
  translateNode(document.body);
  const obs = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') translateNode(m.target);
      else if (m.type === 'attributes') translateNode(m.target);
      else for (const n of m.addedNodes) translateNode(n);
    }
  });
  obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

// ---------- selector de idioma (Cuenta) ----------
export function renderLangChoice() {
  const box = document.getElementById('idioma');
  if (!box) return;
  const cur = lang();
  box.innerHTML = Object.entries(LANGS)
    .map(([key, l]) =>
      '<button class="row-btn" type="button" data-lang-set="' + key + '" translate="no">' +
      '<span class="theme-swatch flag" aria-hidden="true">' + l.flag + '</span>' +
      '<span class="txt"><b>' + l.label + '</b><small>' + l.sub + '</small></span>' +
      '<span class="chev" aria-hidden="true">' + (cur === key ? '✓' : '') + '</span></button>')
    .join('');
}

export function initLangChoice() {
  renderLangChoice();
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lang-set]');
    if (!b || b.dataset.langSet === lang()) return;
    setLang(b.dataset.langSet);
    location.reload(); // toda la app en el idioma nuevo
  });
}
