import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dailyAlarms } from '../js/reminders.js';

const at = (s) => new Date(s).getTime();

test('cada día: 10:30 empezar jornada y 21:30 apuntar lo del día (hoy y 2 días más)', () => {
  const a = dailyAlarms({ cfg: {}, jor: [] }, at('2026-11-20T08:00:00'));
  assert.deepEqual(a.map((x) => x.id), ['dia-m-2026-11-20', 'dia-n-2026-11-20', 'dia-m-2026-11-21', 'dia-n-2026-11-21', 'dia-m-2026-11-22', 'dia-n-2026-11-22']);
  assert.equal(new Date(a[0].at).toTimeString().slice(0, 5), '10:30');
  assert.equal(new Date(a[1].at).toTimeString().slice(0, 5), '21:30');
  assert.match(a[1].title, /No olvides apuntar/);
});

test('si ya empezaste la jornada, no te recuerda empezarla; y respeta tus horas y el «no»', () => {
  const a = dailyAlarms({ cfg: { diaM: '10:00', diaN: '22:00' }, jor: [{ f: '2026-11-20', hi: '07:30' }] }, at('2026-11-20T08:00:00'));
  assert.equal(a[0].id, 'dia-n-2026-11-20');
  assert.equal(new Date(a[0].at).toTimeString().slice(0, 5), '22:00');
  assert.deepEqual(dailyAlarms({ cfg: { diario: 0 }, jor: [] }, at('2026-11-20T08:00:00')), []);
});
