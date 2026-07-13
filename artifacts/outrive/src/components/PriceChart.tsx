import React, { useEffect, useRef } from 'react';
import { createChart, LineSeries, ColorType, IChartApi, ISeriesApi, Time } from 'lightweight-charts';

interface ChartProps {
  data: { time: Time; value: number }[];
  className?: string;
}

export function PriceChart({ data, className }: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0E130E' },
        textColor: 'var(--out-text)',
        fontFamily: 'JetBrains Mono, monospace',
      },
      grid: {
        vertLines: { color: 'var(--out-grid-major)' },
        horzLines: { color: 'var(--out-grid-major)' },
      },
      rightPriceScale: {
        borderColor: 'var(--out-ink-dim)',
      },
      timeScale: {
        borderColor: 'var(--out-ink-dim)',
        timeVisible: true,
      },
      crosshair: {
        vertLine: {
          color: 'var(--out-ink)',
          labelBackgroundColor: 'var(--out-bg)',
        },
        horzLine: {
          color: 'var(--out-ink)',
          labelBackgroundColor: 'var(--out-bg)',
        },
      },
      width: chartContainerRef.current.clientWidth,
      height: 300,
    });

    const lineSeries = chart.addSeries(LineSeries, {
      color: '#C8FF16',
      lineWidth: 2,
    });

    lineSeries.setData(data);

    chartRef.current = chart;
    seriesRef.current = lineSeries;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (seriesRef.current && data) {
      seriesRef.current.setData(data);
    }
  }, [data]);

  return <div ref={chartContainerRef} className={className} />;
}
