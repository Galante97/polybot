import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

export interface AppConfig {
  // Server
  port: number
  nodeEnv: 'development' | 'production' | 'test'

  // Bot Configuration
  executionMode: 'paper' | 'real'
  capital: number
  exposureCap: number // Percentage of capital (0-100)
  minProfitThreshold: number // Minimum profit percentage to execute

  // Risk Management
  maxPositionSize: number // Max capital per market
  killSwitchEnabled: boolean

  // Database
  dbPath: string

  // Market Data
  polymarketWsUrl?: string
  staleDataThresholdMs: number
  // CLOB WebSocket Authentication (all three required for authenticated channels)
  polymarketApiKey?: string
  polymarketApiSecret?: string
  polymarketApiPassphrase?: string
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key]
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue
    }
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

function getEnvNumber(key: string, defaultValue?: number): number {
  const value = process.env[key]
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue
    }
    throw new Error(`Missing required environment variable: ${key}`)
  }
  const num = parseFloat(value)
  if (isNaN(num)) {
    throw new Error(`Invalid number for environment variable ${key}: ${value}`)
  }
  return num
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key]
  if (value === undefined) {
    return defaultValue
  }
  return value.toLowerCase() === 'true'
}

export function loadConfig(): AppConfig {
  const executionMode = (getEnvVar('EXECUTION_MODE', 'paper') as 'paper' | 'real')
  if (executionMode !== 'paper' && executionMode !== 'real') {
    throw new Error('EXECUTION_MODE must be "paper" or "real"')
  }

  return {
    port: getEnvNumber('PORT', 5000),
    nodeEnv: (getEnvVar('NODE_ENV', 'development') as AppConfig['nodeEnv']),

    executionMode,
    capital: getEnvNumber('CAPITAL', 1000),
    exposureCap: getEnvNumber('EXPOSURE_CAP', 60), // 60% of capital
    minProfitThreshold: getEnvNumber('MIN_PROFIT_THRESHOLD', 0.01), // 1%

    maxPositionSize: getEnvNumber('MAX_POSITION_SIZE', 100),
    killSwitchEnabled: getEnvBoolean('KILL_SWITCH_ENABLED', false),

    dbPath: getEnvVar('DB_PATH', './data/polybot.db'),

    polymarketWsUrl: process.env.POLYMARKET_WS_URL,
    staleDataThresholdMs: getEnvNumber('STALE_DATA_THRESHOLD_MS', 30000), // 30 seconds
    polymarketApiKey: process.env.POLYMARKET_API_KEY,
    polymarketApiSecret: process.env.POLYMARKET_API_SECRET,
    polymarketApiPassphrase: process.env.POLYMARKET_API_PASSPHRASE,
  }
}

// Singleton config instance
let config: AppConfig | null = null

export function getConfig(): AppConfig {
  if (!config) {
    config = loadConfig()
  }
  return config
}

