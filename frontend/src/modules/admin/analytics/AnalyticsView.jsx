import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertTriangle, TrendingUp, RefreshCw, ClipboardCheck, BarChart3 } from 'lucide-react';
import { API_URL } from '../../../lib/api';

export default function AnalyticsView({ hospitalId, token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/admin/hospitals/${hospitalId}/analytics`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error?.message || 'Failed to load analytics statistics');
      }
      setData(resData);
    } catch (err) {
      setError(err.message || 'Error fetching analytics');
    } finally {
      setLoading(false);
    }
  }, [hospitalId, token]);

  useEffect(() => {
    if (hospitalId && token) {
      fetchAnalytics();
    }
  }, [hospitalId, token, fetchAnalytics]);

  if (loading) {
    return (
      <div className="py-12 flex flex-col items-center justify-center text-care-muted">
        <Loader2 className="w-8 h-8 animate-spin text-care-success mb-3" />
        <span className="text-sm">Processing clinic metrics ledger...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 bg-care-neutral border border-care-danger/20 text-care-danger rounded-lg text-xs flex items-start">
        <AlertTriangle className="w-5 h-5 mr-3 shrink-0" />
        <span>{error || 'No analytics datasets compiled.'}</span>
      </div>
    );
  }

  const { dailyBookings, noShowRate, doctorUtilization } = data;

  // Bookings stats calculations
  const totalBookings = dailyBookings.reduce((sum, d) => sum + d.count, 0);
  const avgBookings = (totalBookings / 30).toFixed(1);

  // SVG dimensions for 30-day bookings bar chart
  const svgWidth = 700;
  const svgHeight = 160;
  const padding = 24;
  const chartWidth = svgWidth - padding * 2;
  const chartHeight = svgHeight - padding * 2;
  const maxCount = Math.max(...dailyBookings.map(d => d.count), 5); // default limit to at least 5

  return (
    <div className="space-y-8">
      
      {/* Top statistics summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Metric 1: Total Bookings */}
        <div className="care-surface p-6 relative overflow-hidden flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-care-muted uppercase block">30d Physical Appointments</span>
            <span className="text-3xl font-black text-care-heading block">{totalBookings}</span>
            <span className="text-[10px] text-care-success block font-semibold flex items-center">
              <TrendingUp className="w-3.5 h-3.5 mr-1" /> Average: {avgBookings} / day
            </span>
          </div>
          <div className="p-3 bg-care-primary-subtle text-care-success border border-care-success/20 rounded-lg">
            <BarChart3 className="w-6 h-6" />
          </div>
        </div>

        {/* Metric 2: No Show Rate Donut Indicator */}
        <div className="care-surface p-6 relative overflow-hidden flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-care-muted uppercase block">No-Show Rate</span>
            <span className="text-3xl font-black text-care-heading block">{noShowRate}%</span>
            <span className="text-[10px] text-care-muted block font-medium">
              Ratio of uncompleted slots
            </span>
          </div>
          
          {/* Custom SVG Radial Indicator */}
          <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="28"
                cy="28"
                r="22"
                strokeWidth="4"
                stroke="var(--color-border)"
                fill="transparent"
              />
              <circle
                cx="28"
                cy="28"
                r="22"
                strokeWidth="4"
                stroke="var(--color-danger)"
                fill="transparent"
                strokeDasharray={138.2}
                strokeDashoffset={138.2 - (138.2 * Math.min(noShowRate, 100)) / 100}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute text-[10px] font-bold font-mono text-care-danger">
              {Math.round(noShowRate)}%
            </div>
          </div>
        </div>

        {/* Metric 3: Overall Clinic slots worked */}
        <div className="care-surface p-6 relative overflow-hidden flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-care-muted uppercase block">Overall Utilization</span>
            <span className="text-3xl font-black text-care-heading block">
              {doctorUtilization.length > 0 
                ? (doctorUtilization.reduce((sum, d) => sum + d.utilization, 0) / doctorUtilization.length).toFixed(1) 
                : 0}%
            </span>
            <span className="text-[10px] text-care-muted block font-medium">
              Schedules workload capacity
            </span>
          </div>
          <div className="p-3 bg-care-primary-subtle text-care-primary border border-care-primary/20 rounded-lg">
            <ClipboardCheck className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* RENDER GRID: 30-Day bookings trend & Doctor schedules utilization rates */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Bookings Trend SVG Bar Chart */}
        <div className="lg:col-span-2 care-surface p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-bold text-care-heading flex items-center">
              <TrendingUp className="w-5 h-5 text-care-success mr-2" /> Daily Appointment Volume (30d)
            </h3>
            <button
              onClick={fetchAnalytics}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-care-muted hover:bg-care-primary-subtle hover:text-care-heading"
              title="Recalculate Statistics"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="relative overflow-x-auto select-none">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full min-w-[500px] h-fit font-sans"
            >
              {/* Horizontal grid lines */}
              {[0, 0.5, 1].map((ratio, index) => {
                const y = padding + chartHeight * (1 - ratio);
                const gridLabel = Math.round(maxCount * ratio);
                return (
                  <g key={index}>
                    <line
                      x1={padding}
                      y1={y}
                      x2={svgWidth - padding}
                      y2={y}
                      stroke="var(--color-border)"
                      strokeWidth="1"
                      strokeDasharray="4 4"
                    />
                    <text
                      x={padding - 6}
                      y={y + 3}
                      fill="var(--color-text-muted)"
                      fontSize="9"
                      fontWeight="600"
                      textAnchor="end"
                      className="font-mono"
                    >
                      {gridLabel}
                    </text>
                  </g>
                );
              })}

              {/* Draw bars */}
              {dailyBookings.map((day, idx) => {
                const barCount = dailyBookings.length;
                const barSpacing = chartWidth / barCount;
                const barWidth = Math.max(2, barSpacing * 0.6);
                const x = padding + idx * barSpacing + (barSpacing - barWidth) / 2;
                
                const heightRatio = day.count / maxCount;
                const barHeight = Math.max(2, chartHeight * heightRatio); // minimum 2px height for styling visibility
                const y = padding + chartHeight - barHeight;

                // Format short date text e.g. "Jul 05"
                const dateParts = day.date.split('-');
                const monthName = new Date(day.date).toLocaleDateString([], { month: 'short' });
                const showLabel = idx === 0 || idx === 14 || idx === 29;

                return (
                  <g key={idx} className="group">
                    {/* Hover Tooltip Overlay */}
                    <rect
                      x={x - barSpacing/2 + barWidth/2}
                      y={padding}
                      width={barSpacing}
                      height={chartHeight}
                      fill="transparent"
                      className="cursor-pointer"
                    />
                    
                    {/* Active Bar */}
                    <rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={barHeight}
                      rx="1.5"
                      fill="url(#barGradient)"
                      className="group-hover:fill-care-primary transition-colors duration-150"
                    />
                    
                    {/* Label */}
                    {showLabel && (
                      <g>
                        <text
                          x={x + barWidth/2}
                          y={padding + chartHeight + 14}
                          fill="var(--color-text-muted)"
                          fontSize="9"
                          fontWeight="600"
                          textAnchor="middle"
                        >
                          {monthName} {dateParts[2]}
                        </text>
                      </g>
                    )}

                    <title>{`${day.date}: ${day.count} appointments`}</title>
                  </g>
                );
              })}

              {/* Definitions for Gradients */}
              <defs>
                <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" />
                  <stop offset="100%" stopColor="var(--color-primary-hover)" stopOpacity="0.4" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>

        {/* Doctor Utilization display bars list */}
        <div className="care-surface p-6 h-fit">
          <h3 className="text-base font-bold text-care-heading mb-6 flex items-center">
            <ClipboardCheck className="w-5 h-5 text-care-primary mr-2" /> Practitioner Workloads (30d)
          </h3>

          {doctorUtilization.length === 0 ? (
            <div className="portal-empty-state py-12 text-xs">
              No accepted medical staff registered.
            </div>
          ) : (
            <div className="space-y-5">
              {doctorUtilization.map(doc => (
                <div key={doc.doctorId} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-care-muted truncate pr-2">{doc.doctorName}</span>
                    <span className="font-mono font-bold text-care-success shrink-0">{doc.utilization}%</span>
                  </div>

                  {/* Progress track */}
                  <div className="w-full bg-care-neutral border border-care-border h-2.5 rounded-full overflow-hidden relative">
                    <div
                      className="bg-care-primary h-full rounded-full transition-all duration-500"
                      style={{ width: `${doc.utilization}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-[9px] text-care-muted font-mono">
                    <span>Booked: {doc.booked} slots</span>
                    <span>Capacity: {doc.potential} slots</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
