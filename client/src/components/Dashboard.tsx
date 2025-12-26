import Header from './Header'
import PositionsPanel from './PositionsPanel'
import TradeHistory from './TradeHistory'
import TrackedUsers from './TrackedUsers'
import DetectedTrades from './DetectedTrades'
import './Dashboard.css'

function Dashboard(): JSX.Element {
  return (
    <div className="dashboard">
      <Header />
      <div className="dashboard-content">
        <div className="dashboard-left">
          <PositionsPanel />
        </div>
        <div className="dashboard-right">
          <TrackedUsers />
        </div>
      </div>
      <div className="dashboard-bottom">
        <div className="dashboard-bottom-left">
          <DetectedTrades />
        </div>
    
      </div>
    </div>
  )
}

export default Dashboard

