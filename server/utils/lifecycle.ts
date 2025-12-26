import { logger } from './logger.js'

export type ShutdownHandler = () => Promise<void> | void

class LifecycleManager {
  private shutdownHandlers: ShutdownHandler[] = []
  private isShuttingDown = false

  registerShutdownHandler(handler: ShutdownHandler): void {
    this.shutdownHandlers.push(handler)
  }

  async shutdown(signal?: string): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress')
      return
    }

    this.isShuttingDown = true
    logger.info(`Received ${signal || 'shutdown'} signal. Starting graceful shutdown...`)

    // Run all shutdown handlers in reverse order
    for (let i = this.shutdownHandlers.length - 1; i >= 0; i--) {
      try {
        await this.shutdownHandlers[i]()
      } catch (error) {
        logger.error('Error in shutdown handler', { error, handlerIndex: i })
      }
    }

    logger.info('Graceful shutdown complete')
    process.exit(0)
  }

  setupSignalHandlers(): void {
    // Handle termination signals
    process.on('SIGTERM', () => this.shutdown('SIGTERM'))
    process.on('SIGINT', () => this.shutdown('SIGINT'))

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', { error })
      this.shutdown('uncaughtException')
    })

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection', { reason, promise })
      this.shutdown('unhandledRejection')
    })
  }

  getIsShuttingDown(): boolean {
    return this.isShuttingDown
  }
}

// Singleton instance
export const lifecycle = new LifecycleManager()

// Setup signal handlers on import
lifecycle.setupSignalHandlers()

