interface BarChartProps {
  data: Array<{
    label: string;
    value: number;
    color?: string;
  }>;
  maxValue?: number;
  height?: string;
  showValues?: boolean;
}

export default function BarChart({ data, maxValue, height = 'h-48', showValues = true }: BarChartProps) {
  const max = maxValue || Math.max(...data.map(d => d.value), 1);

  return (
    <div className="flex items-end justify-between gap-2 w-full" style={{ height: height === 'h-48' ? '12rem' : '16rem' }}>
      {data.map((item, index) => {
        const heightPercentage = (item.value / max) * 100;
        const barColor = item.color || 'bg-orange-500';

        return (
          <div key={index} className="flex flex-col items-center flex-1 gap-2">
            <div className="relative w-full flex flex-col justify-end" style={{ height: '100%' }}>
              {showValues && item.value > 0 && (
                <div className="text-xs font-semibold text-white text-center mb-1">
                  {item.value}
                </div>
              )}
              <div
                className={`${barColor} rounded-t-lg transition-all duration-500 hover:opacity-80 w-full`}
                style={{ height: `${heightPercentage}%`, minHeight: item.value > 0 ? '4px' : '0' }}
              />
            </div>
            <div className="text-xs text-gray-400 text-center truncate w-full" title={item.label}>
              {item.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
