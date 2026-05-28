import { useState, useEffect } from 'react'
import { 
  BarChart3, Upload, ShieldCheck, LogOut, FileSpreadsheet, 
  AlertTriangle, CheckCircle2, XCircle, Info, Edit3, 
  Calendar, MapPin, Gauge, Lock, Search, Filter, RefreshCw
} from 'lucide-react'
import './App.css'

const API_BASE = import.meta.env.VITE_DJANGO_API_URL || 'http://localhost:8000/api';

function App() {    
  const [token, setToken] = useState(localStorage.getItem('esg_token') || null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  
  const [tab, setTab] = useState('dashboard')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  
  // Data States
  const [summary, setSummary] = useState(null)
  const [records, setRecords] = useState([])
  const [facilities, setFacilities] = useState([])
  const [imports, setImports] = useState([])
  
  // Filtering & Modals
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [search, setSearch] = useState('')
  const [filterScope, setFilterScope] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterFacility, setFilterFacility] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  
  // Ingest Form States
  const [sourceType, setSourceType] = useState('SAP')
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploadStatus, setUploadStatus] = useState(null) // { success, filename, message }
  
  // Edit Form States
  const [editQty, setEditQty] = useState('')
  const [editCo2e, setEditCo2e] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editStatus, setEditStatus] = useState('')

  useEffect(() => {
    if (token) {
      localStorage.setItem('esg_token', token)
      fetchDashboardData()
      fetchRecords()
      fetchFacilities()
      fetchImports()
    } else {
      localStorage.removeItem('esg_token')
    }
  }, [token])

  // Helper fetch wrapper
  const apiFetch = async (endpoint, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options.headers
    }
    
    // Auto-remove Content-Type for multipart file uploads
    if (options.body instanceof FormData) {
      delete headers['Content-Type']
    }

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers })
      if (res.status === 401) {
        setToken(null)
        throw new Error('Unauthorized')
      }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `HTTP error ${res.status}`)
      }
      return await res.json()
    } catch (err) {
      console.error(`API Fetch Error (${endpoint}):`, err)
      throw err;
    }
  }

  // Auth Action
  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginError('')
    try {
      const data = await apiFetch('/token/', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      })
      setToken(data.access)
    } catch (err) {
      setLoginError('Invalid username or password. Use: analyst / analystpass')
    }
  }

  const handleLogout = () => {
    setToken(null)
    localStorage.removeItem('esg_token')
  }

  // Data Fetching Actions
  const fetchDashboardData = async () => {
    try {
      const data = await apiFetch('/dashboard/summary/')
      setSummary(data)
    } catch (err) {
      console.error(err)
    }
  }

  const fetchRecords = async () => {
    setLoading(true)
    try {
      let params = new URLSearchParams()
      if (filterScope) params.append('scope', filterScope)
      if (filterStatus) params.append('status', filterStatus)
      if (filterFacility) params.append('facility_id', filterFacility)
      if (filterCategory) params.append('category', filterCategory)
      
      const data = await apiFetch(`/records/?${params.toString()}`)
      
      // Filter in memory for search query
      if (search) {
        const query = search.toLowerCase()
        const filtered = data.filter(r => 
          r.category.toLowerCase().includes(query) || 
          (r.facility_detail?.name && r.facility_detail.name.toLowerCase().includes(query)) ||
          r.original_unit.toLowerCase().includes(query) ||
          r.id.toString().includes(query)
        )
        setRecords(filtered)
      } else {
        setRecords(data)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Refetch records on filter changes
  useEffect(() => {
    if (token) fetchRecords()
  }, [filterScope, filterStatus, filterFacility, filterCategory, search])

  const fetchFacilities = async () => {
    try {
      const data = await apiFetch('/facilities/')
      setFacilities(data)
    } catch (err) {
      console.error(err)
    }
  }

  const fetchImports = async () => {
    try {
      const data = await apiFetch('/imports/')
      setImports(data)
    } catch (err) {
      console.error(err)
    }
  }

  // File Upload Action
  const handleUpload = async (e) => {
    e.preventDefault()
    if (!selectedFile) return
    setUploading(true)
    setUploadStatus(null)

    const formData = new FormData()
    formData.append('file', selectedFile)
    formData.append('source_type', sourceType)

    try {
      const data = await apiFetch('/upload/', {
        method: 'POST',
        body: formData
      })
      
      setUploadStatus({
        success: data.status !== 'FAILED',
        filename: data.filename,
        message: data.status === 'FAILED' 
          ? 'Parser rejected the document structure (see logs).' 
          : `Ingested ${data.filename} successfully. Mode: ${data.source_type}.`
      })
      
      // Refresh views
      fetchDashboardData()
      fetchRecords()
      fetchImports()
      setSelectedFile(null)
      // Reset file input
      document.getElementById('file-upload-input').value = ''
    } catch (err) {
      setUploadStatus({
        success: false,
        filename: selectedFile.name,
        message: err.message || 'System ingestion failure.'
      })
    } finally {
      setUploading(false)
    }
  }

  // Record Actions (Approve, Reject, Edit)
  const handleApprove = async (id) => {
    try {
      await apiFetch(`/records/${id}/approve/`, { method: 'POST' })
      fetchDashboardData()
      fetchRecords()
      if (selectedRecord && selectedRecord.id === id) {
        // Update modal state
        const updated = await apiFetch(`/records/${id}/`)
        setSelectedRecord(updated)
      }
    } catch (err) {
      alert(err.message)
    }
  }

  const handleReject = async (id) => {
    try {
      await apiFetch(`/records/${id}/reject/`, { method: 'POST' })
      fetchDashboardData()
      fetchRecords()
      if (selectedRecord && selectedRecord.id === id) {
        const updated = await apiFetch(`/records/${id}/`)
        setSelectedRecord(updated)
      }
    } catch (err) {
      alert(err.message)
    }
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    if (!selectedRecord) return
    try {
      await apiFetch(`/records/${selectedRecord.id}/edit/`, {
        method: 'POST',
        body: JSON.stringify({
          normalized_quantity: editQty,
          co2e_kg: editCo2e,
          activity_date: editDate,
          approval_status: editStatus
        })
      })
      fetchDashboardData()
      fetchRecords()
      // Close or refresh modal
      const updated = await apiFetch(`/records/${selectedRecord.id}/`)
      setSelectedRecord(updated)
    } catch (err) {
      alert(err.message)
    }
  }

  const openDetailModal = (record) => {
    setSelectedRecord(record)
    setEditQty(record.normalized_quantity)
    setEditCo2e(record.co2e_kg)
    setEditDate(record.activity_date)
    setEditStatus(record.approval_status)
  }

  const getScopeBadgeClass = (scope) => {
    if (scope === 1) return 'badge scope1'
    if (scope === 2) return 'badge scope2'
    return 'badge scope3'
  }

  const getStatusBadgeClass = (status) => {
    if (status === 'APPROVED') return 'badge status-approved'
    if (status === 'REJECTED') return 'badge status-rejected'
    if (status === 'SUSPICIOUS') return 'badge status-suspicious'
    return 'badge status-pending'
  }

  // --- RENDER PARTS ---

  if (!token) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-logo">
            <ShieldCheck size={40} className="logo-icon" />
            <h2>Breathe ESG</h2>
            <p>Audit & Normalization Platform</p>
          </div>
          
          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input 
                type="text" 
                id="username" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="analyst" 
                required 
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input 
                type="password" 
                id="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" 
                required 
              />
            </div>
            
            {loginError && <div className="error-alert">{loginError}</div>}
            
            <button type="submit" className="btn btn-primary btn-block">
              Authenticate Analyst
            </button>
          </form>
          
          <div className="login-footer">
            <Info size={14} />
            <span>Seed credentials: <code>analyst</code> / <code>analystpass</code></span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-layout">
      {/* Top Header */}
      <header className="app-header">
        <div className="header-brand">
          <ShieldCheck size={28} className="brand-icon" />
          <div>
            <h1>Breathe ESG</h1>
            <span>Audit & Verification Portal</span>
          </div>
        </div>
        
        <nav className="header-nav">
          <button 
            className={`nav-link ${tab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setTab('dashboard')}
          >
            <BarChart3 size={18} />
            Dashboard
          </button>
          <button 
            className={`nav-link ${tab === 'review' ? 'active' : ''}`}
            onClick={() => setTab('review')}
          >
            <FileSpreadsheet size={18} />
            Review Ledger
          </button>
          <button 
            className={`nav-link ${tab === 'ingest' ? 'active' : ''}`}
            onClick={() => setTab('ingest')}
          >
            <Upload size={18} />
            Data Ingestion
          </button>
        </nav>
        
        <div className="header-user">
          <div className="user-indicator">
            <span className="dot dot-active"></span>
            <span>Analyst Mode</span>
          </div>
          <button onClick={handleLogout} className="btn-logout" title="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="app-content">
        
        {/* --- TAB: DASHBOARD --- */}
        {tab === 'dashboard' && (
          <div className="tab-dashboard fade-in">
            {summary ? (
              <>
                {/* Metrics Cards */}
                <div className="metrics-grid">
                  <div className="metric-card main-metric">
                    <span className="metric-label">Total Validated Carbon Footprint</span>
                    <div className="metric-value-container">
                      <span className="metric-value">
                        {summary.total_emissions > 1000 
                          ? (summary.total_emissions / 1000).toFixed(2) 
                          : summary.total_emissions.toLocaleString()}
                      </span>
                      <span className="metric-unit">
                        {summary.total_emissions > 1000 ? 'MT CO2e' : 'kg CO2e'}
                      </span>
                    </div>
                    <p className="metric-description">Aggregate total from all APPROVED emission records.</p>
                  </div>
                  
                  <div className="metric-card border-scope1">
                    <span className="metric-label">Scope 1 (Direct Fuels)</span>
                    <div className="metric-value-container small-value">
                      <span className="metric-value">{(summary.scope1 / 1000).toFixed(2)}</span>
                      <span className="metric-unit">MT</span>
                    </div>
                    <div className="progress-bar-bg">
                      <div 
                        className="progress-bar-fill fill-scope1" 
                        style={{ width: `${summary.total_emissions ? (summary.scope1 / summary.total_emissions) * 100 : 0}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="metric-card border-scope2">
                    <span className="metric-label">Scope 2 (Electricity)</span>
                    <div className="metric-value-container small-value">
                      <span className="metric-value">{(summary.scope2 / 1000).toFixed(2)}</span>
                      <span className="metric-unit">MT</span>
                    </div>
                    <div className="progress-bar-bg">
                      <div 
                        className="progress-bar-fill fill-scope2" 
                        style={{ width: `${summary.total_emissions ? (summary.scope2 / summary.total_emissions) * 100 : 0}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="metric-card border-scope3">
                    <span className="metric-label">Scope 3 (Travel & Lodging)</span>
                    <div className="metric-value-container small-value">
                      <span className="metric-value">{(summary.scope3 / 1000).toFixed(2)}</span>
                      <span className="metric-unit">MT</span>
                    </div>
                    <div className="progress-bar-bg">
                      <div 
                        className="progress-bar-fill fill-scope3" 
                        style={{ width: `${summary.total_emissions ? (summary.scope3 / summary.total_emissions) * 100 : 0}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Audit Lifecycle Overview */}
                <div className="lifecycle-grid">
                  <div className="lifecycle-card">
                    <AlertTriangle className="text-suspicious" size={24} />
                    <div>
                      <h3>{summary.counts.suspicious}</h3>
                      <span>Suspicious Outliers</span>
                    </div>
                  </div>
                  <div className="lifecycle-card">
                    <Calendar className="text-pending" size={24} />
                    <div>
                      <h3>{summary.counts.pending}</h3>
                      <span>Pending Verification</span>
                    </div>
                  </div>
                  <div className="lifecycle-card">
                    <CheckCircle2 className="text-approved" size={24} />
                    <div>
                      <h3>{summary.counts.approved}</h3>
                      <span>Approved Ledgers</span>
                    </div>
                  </div>
                  <div className="lifecycle-card">
                    <XCircle className="text-rejected" size={24} />
                    <div>
                      <h3>{summary.counts.failed}</h3>
                      <span>Failed / Rejected Rows</span>
                    </div>
                  </div>
                </div>

                {/* Charts and Facility Breakdown */}
                <div className="dashboard-grid">
                  {/* Monthly Trend SVG Chart */}
                  <div className="chart-card">
                    <div className="card-header">
                      <h2>Monthly Emission Trends</h2>
                      <span className="subtitle">Scope breakdown over time (MT CO2e)</span>
                    </div>
                    
                    {summary.trend && summary.trend.length > 0 ? (
                      <div className="svg-chart-container">
                        <svg viewBox="0 0 500 220" className="trend-svg">
                          {/* Y-axis helper lines */}
                          <line x1="40" y1="30" x2="480" y2="30" stroke="var(--border)" strokeDasharray="4 4" />
                          <line x1="40" y1="90" x2="480" y2="90" stroke="var(--border)" strokeDasharray="4 4" />
                          <line x1="40" y1="150" x2="480" y2="150" stroke="var(--border)" strokeDasharray="4 4" />
                          <line x1="40" y1="180" x2="480" y2="180" stroke="var(--border)" />
                          
                          {/* Render Bars */}
                          {summary.trend.map((t, idx) => {
                            const barWidth = 32
                            const gap = 24
                            const x = 50 + idx * (barWidth + gap)
                            
                            // Map values to height (max height 140px, scaling to 140)
                            const maxVal = Math.max(...summary.trend.map(d => d.total), 1.0)
                            const scale = 140 / maxVal
                            
                            const h1 = t.scope1 * scale / 1000
                            const h2 = t.scope2 * scale / 1000
                            const h3 = t.scope3 * scale / 1000
                            
                            return (
                              <g key={t.month}>
                                {/* Stacked Bars */}
                                <rect x={x} y={180 - h1} width={barWidth} height={h1} fill="var(--scope1-color)" opacity="0.9" rx="2" />
                                <rect x={x} y={180 - h1 - h2} width={barWidth} height={h2} fill="var(--scope2-color)" opacity="0.9" rx="2" />
                                <rect x={x} y={180 - h1 - h2 - h3} width={barWidth} height={h3} fill="var(--scope3-color)" opacity="0.9" rx="2" />
                                
                                {/* Label */}
                                <text x={x + barWidth/2} y="198" textAnchor="middle" className="chart-label">
                                  {t.month.split('-')[1]}/{t.month.split('-')[0].slice(2)}
                                </text>
                              </g>
                            )
                          })}
                        </svg>
                        
                        <div className="chart-legend">
                          <div className="legend-item"><span className="legend-dot fill-scope1"></span> Scope 1</div>
                          <div className="legend-item"><span className="legend-dot fill-scope2"></span> Scope 2</div>
                          <div className="legend-item"><span className="legend-dot fill-scope3"></span> Scope 3</div>
                        </div>
                      </div>
                    ) : (
                      <div className="empty-chart">
                        <BarChart3 size={32} />
                        <p>No validated emissions data available to build trend chart.</p>
                      </div>
                    )}
                  </div>

                  {/* Facility Contribution */}
                  <div className="chart-card">
                    <div className="card-header">
                      <h2>Emissions by Facility Location</h2>
                      <span className="subtitle">Comparison of site footprint distributions (kg CO2e)</span>
                    </div>

                    <div className="facility-breakdown-list">
                      {summary.facilities && summary.facilities.length > 0 ? (
                        summary.facilities.map(f => {
                          const maxFacEmissions = Math.max(...summary.facilities.map(item => item.co2e_kg), 1.0)
                          const pct = (f.co2e_kg / maxFacEmissions) * 100
                          
                          return (
                            <div key={f.code} className="facility-row">
                              <div className="facility-meta">
                                <span className="facility-name">{f.name}</span>
                                <span className="facility-val">{f.co2e_kg.toLocaleString()} kg</span>
                              </div>
                              <div className="facility-bar-bg">
                                <div className="facility-bar-fill" style={{ width: `${pct}%` }}></div>
                              </div>
                            </div>
                          )
                        })
                      ) : (
                        <div className="empty-chart">
                          <MapPin size={32} />
                          <p>No facility-level validated data available.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="loading-container">
                <RefreshCw className="spinner" size={32} />
                <p>Loading analytics and metrics summary...</p>
              </div>
            )}
          </div>
        )}

        {/* --- TAB: REVIEW LEDGER --- */}
        {tab === 'review' && (
          <div className="tab-review fade-in">
            {/* Filter controls */}
            <div className="filter-bar">
              <div className="search-box">
                <Search size={18} className="search-icon" />
                <input 
                  type="text" 
                  placeholder="Search by facility, category, unit, ID..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="filters-group">
                <div className="filter-select">
                  <Filter size={14} />
                  <select value={filterScope} onChange={(e) => setFilterScope(e.target.value)}>
                    <option value="">All Scopes</option>
                    <option value="1">Scope 1</option>
                    <option value="2">Scope 2</option>
                    <option value="3">Scope 3</option>
                  </select>
                </div>

                <div className="filter-select">
                  <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                    <option value="">All Statuses</option>
                    <option value="PENDING">Pending</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="SUSPICIOUS">Suspicious</option>
                  </select>
                </div>

                <div className="filter-select">
                  <select value={filterFacility} onChange={(e) => setFilterFacility(e.target.value)}>
                    <option value="">All Facilities</option>
                    {facilities.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Table */}
            {loading ? (
              <div className="loading-container">
                <RefreshCw className="spinner" size={32} />
                <p>Querying normalized ledgers...</p>
              </div>
            ) : records.length > 0 ? (
              <div className="table-responsive">
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>Record ID</th>
                      <th>Scope</th>
                      <th>Category</th>
                      <th>Facility</th>
                      <th>Activity Date</th>
                      <th>Original Quantity</th>
                      <th>Calculated CO2e</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map(r => (
                      <tr key={r.id} className={r.approval_status === 'SUSPICIOUS' ? 'row-suspicious' : ''}>
                        <td>
                          <span className="record-id">#{r.id}</span>
                        </td>
                        <td>
                          <span className={getScopeBadgeClass(r.scope)}>Scope {r.scope}</span>
                        </td>
                        <td>
                          <span className="category-label">{r.category.replace('_', ' ')}</span>
                        </td>
                        <td>
                          {r.facility_detail ? (
                            <div className="cell-facility">
                              <span className="fac-name">{r.facility_detail.name}</span>
                              <span className="fac-code">{r.facility_detail.code}</span>
                            </div>
                          ) : (
                            <span className="text-muted">Corporate general</span>
                          )}
                        </td>
                        <td>
                          <span className="cell-date">{r.activity_date}</span>
                        </td>
                        <td>
                          <div className="cell-qty">
                            <span className="val">{parseFloat(r.original_quantity).toLocaleString()}</span>
                            <span className="unit">{r.original_unit}</span>
                          </div>
                        </td>
                        <td>
                          <div className="cell-emissions">
                            <span className="val">{parseFloat(r.co2e_kg).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                            <span className="unit">kg CO2e</span>
                          </div>
                        </td>
                        <td>
                          <span className={getStatusBadgeClass(r.approval_status)}>
                            {r.approval_status === 'SUSPICIOUS' && <AlertTriangle size={12} style={{ marginRight: 4 }} />}
                            {r.approval_status}
                          </span>
                        </td>
                        <td>
                          <div className="cell-actions">
                            <button 
                              onClick={() => openDetailModal(r)} 
                              className="btn btn-secondary btn-sm"
                              title="Audit Trail / Full Details"
                            >
                              <Info size={14} />
                            </button>
                            
                            {!r.is_locked ? (
                              <>
                                <button 
                                  onClick={() => handleApprove(r.id)} 
                                  className="btn btn-success btn-sm"
                                  title="Approve & Lock record"
                                >
                                  <CheckCircle2 size={14} />
                                </button>
                                <button 
                                  onClick={() => handleReject(r.id)} 
                                  className="btn btn-danger btn-sm"
                                  title="Reject record"
                                >
                                  <XCircle size={14} />
                                </button>
                              </>
                            ) : (
                              <Lock size={14} className="text-locked" title="Locked for Audit" />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-ledger">
                <FileSpreadsheet size={48} />
                <h3>No records found matching filters.</h3>
                <p>Head to the <strong>Data Ingestion</strong> tab to import SAP files, utility bills, or travel payloads.</p>
              </div>
            )}
          </div>
        )}

        {/* --- TAB: DATA INGESTION --- */}
        {tab === 'ingest' && (
          <div className="tab-ingest fade-in">
            <div className="ingest-grid">
              
              {/* Ingestion Form */}
              <div className="ingest-card">
                <h2>Import Activity Data</h2>
                <p className="subtitle">Support for SAP files, portal bill CSV exports, and corporate travel JSON</p>
                
                <form onSubmit={handleUpload} className="ingest-form">
                  <div className="form-group">
                    <label>Data Origin / Schema</label>
                    <div className="source-cards">
                      <div 
                        className={`source-card ${sourceType === 'SAP' ? 'selected' : ''}`}
                        onClick={() => setSourceType('SAP')}
                      >
                        <FileSpreadsheet size={24} />
                        <h4>SAP Procurement</h4>
                        <span>Fuel Purchase Ledger</span>
                      </div>

                      <div 
                        className={`source-card ${sourceType === 'UTILITY' ? 'selected' : ''}`}
                        onClick={() => setSourceType('UTILITY')}
                      >
                        <Gauge size={24} />
                        <h4>Utility Portal</h4>
                        <span>Electricity Bills (kWh)</span>
                      </div>

                      <div 
                        className={`source-card ${sourceType === 'TRAVEL' ? 'selected' : ''}`}
                        onClick={() => setSourceType('TRAVEL')}
                      >
                        <MapPin size={24} />
                        <h4>Corporate Travel</h4>
                        <span>Flights / Lodging</span>
                      </div>
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="file-upload-input">Select File</label>
                    <input 
                      type="file" 
                      id="file-upload-input"
                      onChange={(e) => setSelectedFile(e.target.files[0])}
                      required 
                    />
                    <span className="file-hint">
                      {sourceType === 'TRAVEL' ? 'JSON format (API response payload)' : 'CSV flat export file'}
                    </span>
                  </div>

                  {uploadStatus && (
                    <div className={`alert ${uploadStatus.success ? 'alert-success' : 'alert-error'}`}>
                      {uploadStatus.success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                      <div>
                        <strong>{uploadStatus.filename}</strong>
                        <p>{uploadStatus.message}</p>
                      </div>
                    </div>
                  )}

                  <button 
                    type="submit" 
                    className="btn btn-primary"
                    disabled={uploading || !selectedFile}
                  >
                    {uploading ? (
                      <>
                        <RefreshCw className="spinner" size={16} />
                        Processing calculations...
                      </>
                    ) : (
                      <>
                        <Upload size={16} />
                        Ingest & Calculate Carbon
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Recent Inbound Log */}
              <div className="ingest-card">
                <h2>Ingestion Run History</h2>
                <p className="subtitle">Audit log of file pipelines, success rates, and validation outcomes</p>

                <div className="imports-list">
                  {imports.length > 0 ? (
                    imports.map(imp => (
                      <div key={imp.id} className="import-row">
                        <div className="import-meta">
                          <span className="import-source">{imp.source_type}</span>
                          <span className="import-filename">{imp.filename}</span>
                          <span className="import-date">{new Date(imp.created_at).toLocaleString()}</span>
                        </div>
                        
                        <div className="import-status">
                          <span className={`badge ${
                            imp.status === 'SUCCESS' ? 'status-approved' : 
                            imp.status === 'PARTIAL_FAILURE' ? 'status-suspicious' : 
                            'status-rejected'
                          }`}>
                            {imp.status}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty-imports">
                      <RefreshCw size={24} />
                      <p>No historical imports found in ledger.</p>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}
      </main>

      {/* --- RECORD DETAIL & AUDIT MODAL --- */}
      {selectedRecord && (
        <div className="modal-backdrop">
          <div className="modal-card fade-in">
            <div className="modal-header">
              <div>
                <h2>Audit Record #{selectedRecord.id}</h2>
                <span className={getScopeBadgeClass(selectedRecord.scope)}>Scope {selectedRecord.scope}</span>
                <span className="category-modal-label">{selectedRecord.category.replace('_', ' ')}</span>
              </div>
              <button onClick={() => setSelectedRecord(null)} className="btn-close">&times;</button>
            </div>

            <div className="modal-body">
              <div className="modal-sections">
                
                {/* Math calculations ledger */}
                <div className="modal-section border-calc">
                  <h3>Traceable Carbon Logic</h3>
                  <div className="calc-formula">
                    <div className="formula-parts">
                      <div className="part">
                        <span className="label">Original Quantity</span>
                        <span className="val">{parseFloat(selectedRecord.original_quantity).toLocaleString()} {selectedRecord.original_unit}</span>
                      </div>
                      <span className="math-operator">&rarr;</span>
                      <div className="part">
                        <span className="label">Normalized Quantity</span>
                        <span className="val">{parseFloat(selectedRecord.normalized_quantity).toLocaleString()} {selectedRecord.normalized_unit}</span>
                      </div>
                      <span className="math-operator">&times;</span>
                      <div className="part">
                        <span className="label">Emission Factor</span>
                        <span className="val">{selectedRecord.emission_factor_used.value} {selectedRecord.emission_factor_used.unit}</span>
                      </div>
                      <span className="math-operator">=</span>
                      <div className="part highlight-co2">
                        <span className="label">Calculated Carbon</span>
                        <span className="val">{parseFloat(selectedRecord.co2e_kg).toLocaleString(undefined, { maximumFractionDigits: 4 })} kg CO2e</span>
                      </div>
                    </div>
                    <div className="formula-notes">
                      <strong>Factor Origin:</strong> {selectedRecord.emission_factor_used.source}<br/>
                      <strong>Details:</strong> {selectedRecord.emission_factor_used.notes}
                    </div>
                  </div>
                </div>

                {/* Left side: details & edit panel */}
                <div className="modal-two-col">
                  
                  {/* General details and corrections */}
                  <div className="modal-col">
                    <h3>Technical Data & Corrections</h3>
                    {selectedRecord.is_locked ? (
                      <div className="locked-alert">
                        <Lock size={16} />
                        <span>This ledger row is APPROVED and locked for audit. Corrections are disabled.</span>
                      </div>
                    ) : (
                      <form onSubmit={handleEditSubmit} className="edit-form">
                        <div className="form-group">
                          <label>Normalized Quantity ({selectedRecord.normalized_unit})</label>
                          <input 
                            type="number" 
                            step="0.0001" 
                            value={editQty}
                            onChange={(e) => setEditQty(e.target.value)}
                            required
                          />
                        </div>

                        <div className="form-group">
                          <label>Calculated Emissions (kg CO2e)</label>
                          <input 
                            type="number" 
                            step="0.0001" 
                            value={editCo2e}
                            onChange={(e) => setEditCo2e(e.target.value)}
                            required
                          />
                        </div>

                        <div className="form-group">
                          <label>Activity Date</label>
                          <input 
                            type="date" 
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            required
                          />
                        </div>

                        <div className="form-group">
                          <label>Review Status</label>
                          <select 
                            value={editStatus} 
                            onChange={(e) => setEditStatus(e.target.value)}
                          >
                            <option value="PENDING">Pending</option>
                            <option value="APPROVED">Approved</option>
                            <option value="REJECTED">Rejected</option>
                            <option value="SUSPICIOUS">Suspicious</option>
                          </select>
                        </div>

                        <button type="submit" className="btn btn-primary">
                          <Edit3 size={14} />
                          Apply Correction Log
                        </button>
                      </form>
                    )}

                    <div className="raw-data-panel">
                      <h4>Raw Source Object (Ingested Row)</h4>
                      <pre>{JSON.stringify(selectedRecord.raw_record_detail?.raw_data, null, 2)}</pre>
                    </div>
                  </div>

                  {/* Right side: Audit Trail timeline */}
                  <div className="modal-col border-left">
                    <h3>Audit Trail History</h3>
                    <div className="audit-timeline">
                      {selectedRecord.audit_logs_detail && selectedRecord.audit_logs_detail.length > 0 ? (
                        selectedRecord.audit_logs_detail.map((log, index) => (
                          <div key={log.id || index} className="timeline-item">
                            <div className="timeline-dot"></div>
                            <div className="timeline-content">
                              <span className="log-action">{log.action_type}</span>
                              <p>
                                {log.action_type === 'IMPORT' && 'Record ingested from source file.'}
                                {log.action_type === 'APPROVE' && 'Analyst approved and locked ledger.'}
                                {log.action_type === 'REJECT' && 'Analyst rejected ledger record.'}
                                {log.action_type === 'EDIT' && (
                                  <>
                                    Modified <code>{log.field_name}</code> from <code>{log.old_value || 'None'}</code> to <code>{log.new_value}</code>.
                                  </>
                                )}
                              </p>
                              <div className="log-meta">
                                <span>{log.changed_by_detail?.username || 'System Engine'}</span>
                                <span>&bull;</span>
                                <span>{new Date(log.timestamp).toLocaleString()}</span>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-muted">No audit trail records found.</p>
                      )}
                    </div>
                  </div>

                </div>

              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => setSelectedRecord(null)} className="btn btn-secondary">Close Audit View</button>
              {!selectedRecord.is_locked && (
                <div className="footer-actions">
                  <button 
                    onClick={() => { handleReject(selectedRecord.id) }} 
                    className="btn btn-danger"
                  >
                    Reject Record
                  </button>
                  <button 
                    onClick={() => { handleApprove(selectedRecord.id) }} 
                    className="btn btn-success"
                  >
                    Approve & Lock
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
