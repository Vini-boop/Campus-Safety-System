/**
 * Enhanced OB Book Component - Production Ready
 * 
 * Features:
 * - Real-time updates with Firebase
 * - Timeline view with audit trail
 * - Quick follow-up panel
 * - Status progression tracker
 * - Advanced filtering
 * - Search functionality
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  subscribeToOBLogs, 
  updateOBStatus, 
  addFollowUp, 
  searchOBLogs,
  downloadOBLogsCSV
} from '../services/obLogService';
import { 
  ClockIcon, 
  CheckCircleIcon, 
  ArrowDownTrayIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline';

// ─── Status Badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const statusConfig = {
    open: { color: 'bg-red-500', label: 'Open', icon: '🔴' },
    assigned: { color: 'bg-orange-500', label: 'Assigned', icon: '👤' },
    investigating: { color: 'bg-blue-500', label: 'Investigating', icon: '🔍' },
    resolved: { color: 'bg-green-500', label: 'Resolved', icon: '✅' },
    closed: { color: 'bg-gray-500', label: 'Closed', icon: '🔒' }
  };
  
  const config = statusConfig[status?.toLowerCase()] || statusConfig.open;
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${config.color}/20 text-${config.color.split('-')[1]}-400 border border-${config.color.split('-')[1]}-500/30`}>
      {config.icon} {config.label}
    </span>
  );
};

// ─── Priority Badge ───────────────────────────────────────────────────────────
const PriorityBadge = ({ priority }) => {
  const config = {
    critical: { color: 'bg-red-600', label: 'CRITICAL', class: 'animate-pulse' },
    high: { color: 'bg-orange-500', label: 'HIGH' },
    medium: { color: 'bg-yellow-500', label: 'MEDIUM' },
    low: { color: 'bg-green-500', label: 'LOW' }
  };
  
  const cfg = config[priority?.toLowerCase()] || config.medium;
  
  return (
    <span className={`${cfg.color} text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase ${cfg.class || ''}`}>
      {cfg.label}
    </span>
  );
};

// ─── Type Badge ───────────────────────────────────────────────────────────────
const TypeBadge = ({ type }) => {
  const map = {
    sos: { bg: 'bg-red-600', label: 'SOS' },
    emergency: { bg: 'bg-red-600', label: 'EMG' },
    medical: { bg: 'bg-blue-500', label: 'MED' },
    security: { bg: 'bg-purple-600', label: 'SEC' },
    assault: { bg: 'bg-red-700', label: 'AST' },
    theft: { bg: 'bg-orange-600', label: 'THF' },
    harassment: { bg: 'bg-pink-600', label: 'HRS' }
  };
  
  const t = type?.toLowerCase() || '';
  const cfg = map[t] || { bg: 'bg-gray-600', label: '???' };
  
  return (
    <span className={`${cfg.bg} text-white text-xs font-bold px-2 py-1 rounded-lg`}>
      {cfg.label}
    </span>
  );
};

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ title, value, subtitle, icon, color = 'blue' }) => {
  const colors = {
    blue: 'bg-blue-500',
    red: 'bg-red-500',
    orange: 'bg-orange-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500'
  };
  
  return (
    <div className="bg-[#141728] border border-[#252A41] rounded-2xl p-5 flex flex-col gap-3 hover:border-[#3d4466] transition-colors">
      <div className="flex items-center justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[color]}`}>
          <span className="text-white text-xl">{icon}</span>
        </div>
      </div>
      <div>
        <p className="text-gray-400 text-sm">{title}</p>
        <p className="text-white text-3xl font-bold mt-1">{value}</p>
        {subtitle && <p className="text-gray-500 text-xs mt-1">{subtitle}</p>}
      </div>
    </div>
  );
};

// ─── Timeline Viewer ──────────────────────────────────────────────────────────
const TimelineViewer = ({ timeline }) => {
  if (!timeline || timeline.length === 0) {
    return (
      <div className="text-center text-gray-500 py-8">
        No timeline events recorded
      </div>
    );
  }
  
  return (
    <div className="space-y-4 bg-[#1e2347] rounded-xl p-4 max-h-96 overflow-y-auto">
      <h4 className="text-white font-semibold text-sm flex items-center gap-2">
        <ClockIcon className="w-4 h-4" />
        Case Timeline ({timeline.length} events)
      </h4>
      
      <div className="relative border-l-2 border-purple-500/30 ml-3 space-y-4">
        {timeline.map((event, idx) => (
          <div key={idx} className="relative pl-6">
            {/* Timeline Dot */}
            <div className={`absolute -left-1.5 top-1 w-3 h-3 rounded-full ${
              event.action.includes('created') ? 'bg-blue-500' :
              event.action.includes('status_changed') ? 'bg-orange-500' :
              event.action.includes('follow_up') ? 'bg-green-500' :
              'bg-purple-500'
            }`} />
            
            {/* Event Content */}
            <div className="bg-[#0D1130] rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-white text-xs font-semibold">
                  {event.action.replace(/_/g, ' ').toUpperCase()}
                </p>
                <p className="text-gray-500 text-[10px] whitespace-nowrap ml-2">
                  {event.timestamp?.toDate ? 
                    event.timestamp.toDate().toLocaleString() : 
                    new Date(event.timestamp).toLocaleString()}
                </p>
              </div>
              <p className="text-gray-400 text-xs">{event.notes}</p>
              <p className="text-purple-400 text-[10px] mt-1">
                By: {event.actorName} ({event.actorRole})
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── OB Detail Modal ──────────────────────────────────────────────────────────
const OBDetailModal = ({ ob, onClose, onAddFollowUp, onUpdateStatus, onAssign, session }) => {
  const [followUpNote, setFollowUpNote] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [showTimeline, setShowTimeline] = useState(true);
  const [assigningTo, setAssigningTo] = useState('');
  
  const handleAddFollowUp = async () => {
    if (!followUpNote.trim()) {
      alert('Please enter follow-up notes');
      return;
    }
    
    await onAddFollowUp(ob.id, followUpNote, actionTaken);
    setFollowUpNote('');
    setActionTaken('');
  };
  
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#141728] border border-[#252A41] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[#141728] border-b border-[#252A41] p-5 flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold text-lg flex items-center gap-2">
              📘 {ob.obNumber}
            </h3>
            <p className="text-gray-400 text-xs mt-1">Occurrence Book Details</p>
          </div>
          <button 
            onClick={onClose} 
            className="text-gray-500 hover:text-white p-2 rounded-lg transition-colors"
          >
            ✕
          </button>
        </div>
        
        <div className="p-5 space-y-6">
          {/* Status & Priority */}
          <div className="flex items-center justify-between bg-[#1e2347] rounded-xl p-4">
            <div className="flex items-center gap-3">
              <StatusBadge status={ob.status} />
              <PriorityBadge priority={ob.priority} />
              {ob.isHighRisk && (
                <span className="bg-red-600/20 text-red-400 border border-red-500/30 px-2 py-1 rounded text-xs font-semibold animate-pulse">
                  ⚠️ HIGH RISK
                </span>
              )}
            </div>
            <div className="text-right">
              <p className="text-gray-400 text-xs">Created</p>
              <p className="text-white text-sm">
                {ob.createdAt?.toDate ? 
                  ob.createdAt.toDate().toLocaleDateString() : 
                  new Date(ob.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          
          {/* Incident Details */}
          <div className="bg-[#1e2347] rounded-xl p-4 space-y-3">
            <h4 className="text-white font-semibold text-sm">📋 Incident Details</h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-gray-500">Category</p>
                <TypeBadge type={ob.category} />
              </div>
              <div>
                <p className="text-gray-500">Location</p>
                <p className="text-white">{ob.location?.address || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-gray-500">Student</p>
                <p className="text-white">{ob.studentName}</p>
                <p className="text-gray-500 text-[10px]">{ob.studentEmail}</p>
              </div>
              <div>
                <p className="text-gray-500">Assigned To</p>
                <p className="text-white">{ob.assignedToName || 'Unassigned'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-gray-500">Summary</p>
                <p className="text-white text-sm bg-[#0D1130] p-2 rounded">{ob.summary}</p>
              </div>
              {ob.description && (
                <div className="col-span-2">
                  <p className="text-gray-500">Full Description</p>
                  <p className="text-white text-sm bg-[#0D1130] p-3 rounded whitespace-pre-wrap">
                    {ob.description}
                  </p>
                </div>
              )}
            </div>
          </div>
          
          {/* Follow-Up Form */}
          <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
            <h4 className="text-purple-400 font-semibold text-sm mb-3">➕ Add Follow-up</h4>
            <textarea
              value={followUpNote}
              onChange={(e) => setFollowUpNote(e.target.value)}
              placeholder="Enter follow-up notes, actions taken, investigation updates..."
              rows={4}
              className="w-full px-3 py-2 bg-[#0D1130] border border-[#252A41] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none text-sm"
            />
            <input
              type="text"
              value={actionTaken}
              onChange={(e) => setActionTaken(e.target.value)}
              placeholder="Action taken (optional)"
              className="mt-2 w-full px-3 py-2 bg-[#0D1130] border border-[#252A41] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 text-sm"
            />
            <button
              onClick={handleAddFollowUp}
              disabled={!followUpNote.trim()}
              className="mt-3 w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 rounded-lg transition-colors text-sm"
            >
              Save Follow-up
            </button>
          </div>
          
          {/* Status Update */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
            <h4 className="text-blue-400 font-semibold text-sm mb-3">🔄 Update Status</h4>
            <div className="grid grid-cols-5 gap-2">
              {['open', 'assigned', 'investigating', 'resolved', 'closed'].map(status => (
                <button
                  key={status}
                  onClick={() => onUpdateStatus(ob.id, status)}
                  disabled={ob.status === status}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors capitalize ${
                    ob.status === status
                      ? 'bg-purple-600 text-white'
                      : 'bg-[#0D1130] text-gray-400 hover:bg-[#1e2347]'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
          
          {/* Timeline */}
          {showTimeline && ob.timeline && (
            <TimelineViewer timeline={ob.timeline} />
          )}
        </div>
        
        {/* Footer */}
        <div className="sticky bottom-0 bg-[#141728] border-t border-[#252A41] p-5">
          <button
            onClick={onClose}
            className="w-full bg-[#1e2347] hover:bg-[#252A41] text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main OB Book Component ───────────────────────────────────────────────────
const OBBookEnhanced = ({ session }) => {
  const [obLogs, setObLogs] = useState([]);
  const [selectedOB, setSelectedOB] = useState(null);
  const [filters, setFilters] = useState({
    year: new Date().getFullYear(),
    status: 'all',
    priority: 'all',
    assignedTo: 'all'
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  
  // Real-time subscription
  useEffect(() => {
    console.log('[OB Book] Setting up real-time listener...');
    
    const unsubscribe = subscribeToOBLogs(
      filters,
      (logs) => {
        console.log(`✅ [OB Book] Received ${logs.length} OB logs`);
        setObLogs(logs);
      },
      (error) => {
        console.error('❌ [OB Book] Listener error:', error);
      }
    );
    
    return () => {
      console.log('[OB Book] Cleaning up listener');
      unsubscribe();
    };
  }, [filters]);
  
  // Filtered logs with memoization
  const filteredLogs = useMemo(() => {
    return obLogs.filter(log => {
      if (filters.status !== 'all' && log.status !== filters.status) return false;
      if (filters.priority !== 'all' && log.priority !== filters.priority) return false;
      if (filters.assignedTo !== 'all' && filters.assignedTo !== 'unassigned' && log.assignedTo !== filters.assignedTo) return false;
      if (filters.assignedTo === 'unassigned' && log.assignedTo) return false;
      return true;
    });
  }, [obLogs, filters]);
  
  // Statistics
  const stats = useMemo(() => ({
    total: obLogs.length,
    open: obLogs.filter(l => l.status === 'open').length,
    investigating: obLogs.filter(l => l.status === 'investigating').length,
    closed: obLogs.filter(l => l.status === 'closed').length,
    highRisk: obLogs.filter(l => l.isHighRisk).length,
    unassigned: obLogs.filter(l => !l.assignedTo).length
  }), [obLogs]);
  
  // Search handler
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    
    setIsSearching(true);
    const results = await searchOBLogs(searchQuery, filters.year);
    setSearchResults(results);
  }, [searchQuery, filters.year]);
  
  // Export handler
  const handleExport = useCallback(() => {
    downloadOBLogsCSV(filteredLogs, `ob-logs-${new Date().toISOString().split('T')[0]}.csv`);
  }, [filteredLogs]);
  
  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="grid grid-cols-6 gap-4">
        <StatCard title="Total" value={stats.total} icon="📘" color="blue" />
        <StatCard title="Open" value={stats.open} icon="🔴" color="red" />
        <StatCard title="Investigating" value={stats.investigating} icon="🔍" color="orange" />
        <StatCard title="Closed" value={stats.closed} icon="✅" color="green" />
        <StatCard title="High Risk" value={stats.highRisk} icon="⚠️" color="purple" />
        <StatCard title="Unassigned" value={stats.unassigned} icon="👤" color="orange" />
      </div>
      
      {/* Filters & Search */}
      <div className="flex flex-wrap gap-3 bg-[#141728] p-4 rounded-xl">
        <select 
          value={filters.year}
          onChange={(e) => setFilters({...filters, year: parseInt(e.target.value)})}
          className="bg-[#0D1130] border border-[#252A41] text-white px-4 py-2 rounded-lg text-sm"
        >
          {[2024, 2025, 2026].map(year => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
        
        <select 
          value={filters.status}
          onChange={(e) => setFilters({...filters, status: e.target.value})}
          className="bg-[#0D1130] border border-[#252A41] text-white px-4 py-2 rounded-lg text-sm"
        >
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="assigned">Assigned</option>
          <option value="investigating">Investigating</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        
        <select 
          value={filters.priority}
          onChange={(e) => setFilters({...filters, priority: e.target.value})}
          className="bg-[#0D1130] border border-[#252A41] text-white px-4 py-2 rounded-lg text-sm"
        >
          <option value="all">All Priority</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        
        <select 
          value={filters.assignedTo}
          onChange={(e) => setFilters({...filters, assignedTo: e.target.value})}
          className="bg-[#0D1130] border border-[#252A41] text-white px-4 py-2 rounded-lg text-sm"
        >
          <option value="all">All Officers</option>
          <option value="unassigned">Unassigned</option>
          {/* Add officer options dynamically */}
        </select>
        
        {/* Search */}
        <div className="flex-1 min-w-[200px] relative">
          <MagnifyingGlassIcon className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search OB logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-full pl-9 pr-4 py-2 bg-[#0D1130] border border-[#252A41] text-white text-sm rounded-lg focus:outline-none focus:border-purple-500"
          />
        </div>
        
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          Search
        </button>
        
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-[#1e2347] hover:bg-[#252A41] text-gray-300 text-sm font-semibold rounded-lg transition-colors"
        >
          <ArrowDownTrayIcon className="w-4 h-4" />
          Export CSV
        </button>
      </div>
      
      {/* Results Info */}
      {isSearching && searchResults.length > 0 && (
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-3">
          <p className="text-purple-300 text-sm">
            🔍 Found {searchResults.length} matching result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"
          </p>
        </div>
      )}
      
      {/* OB Table */}
      <div className="bg-[#141728] border border-[#252A41] rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#1e2347]">
            <tr>
              <th className="px-4 py-4 text-left text-gray-400">OB Number</th>
              <th className="px-4 py-4 text-left text-gray-400">Category</th>
              <th className="px-4 py-4 text-left text-gray-400">Summary</th>
              <th className="px-4 py-4 text-left text-gray-400">Location</th>
              <th className="px-4 py-4 text-left text-gray-400">Student</th>
              <th className="px-4 py-4 text-left text-gray-400">Status</th>
              <th className="px-4 py-4 text-left text-gray-400">Priority</th>
              <th className="px-4 py-4 text-left text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e2347]">
            {(isSearching ? searchResults : filteredLogs).map(log => (
              <tr 
                key={log.id}
                className="hover:bg-[#1e2347/50] cursor-pointer transition-colors"
                onClick={() => setSelectedOB(log)}
              >
                <td className="px-4 py-4">
                  <span className="text-purple-400 font-mono text-xs font-bold bg-purple-500/10 px-2 py-1 rounded border border-purple-500/30">
                    {log.obNumber}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <TypeBadge type={log.category} />
                </td>
                <td className="px-4 py-4">
                  <p className="text-white text-xs truncate max-w-[200px]">{log.summary}</p>
                  {log.followUpNotes?.length > 0 && (
                    <p className="text-green-400 text-[10px] mt-1 flex items-center gap-1">
                      <CheckCircleIcon className="w-3 h-3" /> {log.followUpNotes.length} follow-ups
                    </p>
                  )}
                </td>
                <td className="px-4 py-4 text-gray-300">
                  <p className="text-white truncate max-w-[150px]">{log.location?.address || 'Unknown'}</p>
                </td>
                <td className="px-4 py-4 text-gray-300">
                  <p className="text-white text-xs">{log.studentName}</p>
                  <p className="text-gray-500 text-[10px]">{log.studentEmail}</p>
                </td>
                <td className="px-4 py-4">
                  <StatusBadge status={log.status} />
                </td>
                <td className="px-4 py-4">
                  <PriorityBadge priority={log.priority} />
                </td>
                <td className="px-4 py-4">
                  <button className="text-xs px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors">
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {(isSearching ? searchResults : filteredLogs).length === 0 && (
          <div className="p-8 text-center text-gray-500">
            No OB logs found matching your criteria.
          </div>
        )}
      </div>
      
      {/* OB Detail Modal */}
      {selectedOB && (
        <OBDetailModal 
          ob={selectedOB}
          onClose={() => setSelectedOB(null)}
          onAddFollowUp={async (notes, action) => {
            await addFollowUp(selectedOB.id, notes, action, session.uid, session.name);
          }}
          onUpdateStatus={async (newStatus) => {
            await updateOBStatus(selectedOB.id, newStatus, session.uid, session.name);
          }}
          session={session}
        />
      )}
    </div>
  );
};

export default OBBookEnhanced;
