import { useState, useEffect } from 'react'

const today = new Date()
const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
const daysLeft = daysInMonth - today.getDate()

const CEO_NAME = 'Лида'
const GREETINGS: Record<number, string> = {
  1: 'сегодня будет хороший день!',
  2: 'ты уже отлично справляешься!',
  3: 'вперёд к маленьким победам!',
  4: 'всё получится, шаг за шагом!',
  5: 'рад видеть тебя снова!',
  6: 'время сделать что-то классное!',
  7: 'ты ближе к цели!',
  8: 'новый день — новые возможности!',
  9: 'спокойно, у тебя всё под контролем!',
  10: 'сегодня можно чуть лучше!',
  11: 'хороший момент начать!',
  12: 'мир ждёт твоих идей!',
  13: 'пусть день будет лёгким!',
  14: 'ты умеешь удивлять!',
  15: 'ещё один шаг вперёд!',
  16: 'настройся на хороший ритм!',
  17: 'маленький прогресс тоже прогресс!',
  18: 'сильное начало дня!',
  19: 'сделаем этот день приятным!',
  20: 'отличный день для роста!',
  21: 'всё важное получится!',
  22: 'ты сегодня в ударе!',
  23: 'время сиять понемногу!',
  24: 'пусть всё складывается удачно!',
  25: 'хорошие вещи уже рядом!',
  26: 'ты двигаешься в верном направлении!',
  27: 'день начинается отлично!',
  28: 'улыбнись, ты молодец!',
  29: 'сегодня точно что-то получится!',
  30: 'главное — не останавливаться!',
  31: 'добро пожаловать в продуктивность!',
}
const dayNum = today.getDate()
const greeting = GREETINGS[dayNum] || 'отличного дня!'

const dd = String(today.getDate()).padStart(2, '0')
const mm = String(today.getMonth() + 1).padStart(2, '0')
const dateShort = `${dd}.${mm}`

function weatherEmoji(code: number): string {
  if (code === 0) return '☀️'
  if ([1, 2].includes(code)) return '🌤️'
  if (code === 3) return '☁️'
  if ([45, 48].includes(code)) return '🌫️'
  if ([51, 53, 55, 61, 63].includes(code)) return '🌦️'
  if ([65, 80, 81, 82].includes(code)) return '🌧️'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '❄️'
  if ([95, 96, 99].includes(code)) return '⛈️'
  return '⛅'
}

const FORECAST = 107
const forecastColor = FORECAST >= 100 ? '#34c759' : FORECAST >= 85 ? '#ffd60a' : '#ff453a'

const crmManagers = [
  { name: 'Анна', prog: 118 },
  { name: 'Дмитрий', prog: 109 },
  { name: 'Елена', prog: 102 },
  { name: 'Кирилл', prog: 94 },
]
const dozhimManagers = [
  { name: 'Василий', prog: 124 },
  { name: 'Мария', prog: 111 },
  { name: 'Сергей', prog: 98 },
  { name: 'Татьяна', prog: 87 },
]

const MEDALS = ['🥇', '🥈', '🥉']

export default function App() {
  const [tab, setTab] = useState<'crm' | 'dozhim'>('crm')
  const [weatherEmoji_, setWeatherEmoji] = useState('…')
  const [weatherTemp, setWeatherTemp] = useState('')
  const allManagers = tab === 'crm' ? crmManagers : dozhimManagers
  const leaders = allManagers.filter(m => m.prog >= 100).slice(0, 3)

  useEffect(() => {
    const lat = 56.8389
    const lon = 60.6057
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`)
      .then(r => r.json())
      .then(data => {
        const temp = Math.round(data.current.temperature_2m)
        const code = data.current.weather_code
        setWeatherEmoji(weatherEmoji(code))
        setWeatherTemp((temp > 0 ? '+' : '') + temp + '°')
      })
      .catch(() => { setWeatherEmoji('⚠️'); setWeatherTemp('--°') })
  }, [])

  return (
    <div style={{
      background: '#1c1c1e',
      minHeight: '100vh',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
      color: '#fff',
      maxWidth: 390,
      margin: '0 auto',
      padding: '0 0 40px',
    }}>

      {/* HEADER */}
      <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>

        {/* Greeting — full width */}
        <div style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 11, fontWeight: 700, color: '#fff', lineHeight: 1.5, marginBottom: 14 }}>
          <span style={{ color: '#0a84ff' }}>{CEO_NAME}</span>
          {', '}
          {greeting}
        </div>

        {/* Bottom row: forecast left | date+weather+остаток right */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.07em', marginBottom: 2 }}>ПРОГНОЗ</div>
            <div style={{ fontSize: 40, fontWeight: 800, color: forecastColor, lineHeight: 1, letterSpacing: '-1px' }}>
              {FORECAST}%
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>{dateShort}</span>
              <span style={{ fontSize: 14 }}>{weatherEmoji_}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>{weatherTemp}</span>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
              остаток <span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>{daysLeft}</span> д.
            </div>
          </div>
        </div>
      </div>

      {/* METRICS GRID */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 8, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Ключевые показатели
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>

          <div style={{ background: '#2c2c2e', borderRadius: 14, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', marginBottom: 6, letterSpacing: '0.05em' }}>CRM</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 7 }}>
              <span style={{ fontSize: 26, fontWeight: 700, color: '#0a84ff', lineHeight: 1 }}>47</span>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>/ 60</span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 4, height: 4, overflow: 'hidden' }}>
              <div style={{ width: '78%', height: '100%', background: '#0a84ff', borderRadius: 4 }} />
            </div>
            <div style={{ fontSize: 11, color: '#0a84ff', marginTop: 5, fontWeight: 600 }}>78%</div>
          </div>

          <div style={{ background: '#2c2c2e', borderRadius: 14, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', marginBottom: 6, letterSpacing: '0.05em' }}>ДОЖИМ</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 7 }}>
              <span style={{ fontSize: 26, fontWeight: 700, color: '#bf5af2', lineHeight: 1 }}>23</span>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>/ 30</span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 4, height: 4, overflow: 'hidden' }}>
              <div style={{ width: '77%', height: '100%', background: '#bf5af2', borderRadius: 4 }} />
            </div>
            <div style={{ fontSize: 11, color: '#bf5af2', marginTop: 5, fontWeight: 600 }}>77%</div>
          </div>

          <div style={{ background: '#2c2c2e', borderRadius: 14, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', marginBottom: 6, letterSpacing: '0.05em' }}>ДОХОД КОМАНДЫ</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#34c759', lineHeight: 1 }}>2.4М ₽</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 5 }}>за текущий месяц</div>
          </div>

          <div style={{ background: '#2c2c2e', borderRadius: 14, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)', marginBottom: 6, letterSpacing: '0.05em' }}>КОНВЕРСИЯ</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#ff9f0a', lineHeight: 1 }}>34%</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 5 }}>визиты → сделки</div>
          </div>
        </div>
      </div>

      {/* LEADERS */}
      <div style={{ padding: '18px 16px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Лидеры
          </div>
          <div style={{ display: 'flex', gap: 3, background: '#2c2c2e', borderRadius: 8, padding: 3 }}>
            {(['crm', 'dozhim'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                fontSize: 11, fontWeight: 600,
                padding: '4px 12px', borderRadius: 6,
                border: 'none', cursor: 'pointer',
                background: tab === t ? 'rgba(255,255,255,0.13)' : 'transparent',
                color: tab === t ? '#fff' : 'rgba(255,255,255,0.35)',
                transition: 'all 0.15s',
              }}>
                {t === 'crm' ? 'CRM' : 'Дожим'}
              </button>
            ))}
          </div>
        </div>
        {leaders.length > 0 ? (
          <div style={{ display: 'flex', gap: 8 }}>
            {leaders.map((m, i) => (
              <div key={m.name} style={{
                flex: 1,
                position: 'relative',
                background: '#2c2c2e',
                borderRadius: 12,
                padding: '10px 10px 8px',
                border: '1px solid rgba(255,255,255,0.07)',
              }}>
                <span style={{
                  position: 'absolute', top: 6, right: 7,
                  fontSize: 13, lineHeight: 1,
                }}>{MEDALS[i]}</span>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', lineHeight: 1.3, paddingRight: 18 }}>{m.name}</div>
                <div style={{
                  fontSize: 13, fontWeight: 700, color: '#34c759',
                  marginTop: 5,
                }}>{m.prog}%</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            background: '#2c2c2e', borderRadius: 12, padding: '14px',
            border: '1px solid rgba(255,255,255,0.06)',
            textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)',
          }}>
            Нет менеджеров с прогнозом ≥ 100%
          </div>
        )}
      </div>

      {/* ALERTS */}
      <div style={{ padding: '18px 16px 0' }}>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
          Внимание
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { icon: '🔴', title: 'Без визитов сегодня', sub: '2 менеджера не провели ни одного', borderColor: 'rgba(255,69,58,0.3)', bg: 'rgba(255,69,58,0.08)', titleColor: '#ff453a' },
            { icon: '⚠️', title: 'Отстают от дневного плана', sub: 'Иванов, Петров', borderColor: 'rgba(255,214,10,0.25)', bg: 'rgba(255,214,10,0.07)', titleColor: '#ffd60a' },
            { icon: '📊', title: 'На грани плана', sub: 'Сидорова — 94%', borderColor: 'rgba(255,214,10,0.25)', bg: 'rgba(255,214,10,0.07)', titleColor: '#ffd60a' },
          ].map(a => (
            <div key={a.title} style={{
              background: a.bg, border: `1px solid ${a.borderColor}`,
              borderRadius: 12, padding: '10px 14px',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{a.icon}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: a.titleColor }}>{a.title}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{a.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>


    </div>
  )
}
