interface DataPoint {
  label: string;
  value1: number;
  value2: number;
  color1: string;
  color2: string;
}

interface DualBarChartProps {
  data: DataPoint[];
  height?: string;
  label1: string;
  label2: string;
}

export default function DualBarChart({ data, height = 'h-64', label1, label2 }: DualBarChartProps) {
  const maxValue = Math.max(
    ...data.map(d => Math.max(d.value1, d.value2))
  );

  return (
    <div className="w-full">
      <div className={`${height} flex items-end justify-between gap-2 px-2`}>
        {data.map((item, index) => {
          const height1 = maxValue > 0 ? (item.value1 / maxValue) * 100 : 0;
          const height2 = maxValue > 0 ? (item.value2 / maxValue) * 100 : 0;

          return (
            <div key={index} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex gap-1 items-end h-full">
                <div
                  className={`flex-1 ${item.color1} rounded-t transition-all duration-300 relative group`}
                  style={{ height: `${height1}%` }}
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    R$ {item.value1.toFixed(0)}
                  </div>
                </div>
                <div
                  className={`flex-1 ${item.color2} rounded-t transition-all duration-300 relative group`}
                  style={{ height: `${height2}%` }}
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    R$ {item.value2.toFixed(0)}
                  </div>
                </div>
              </div>
              <span className="text-xs text-gray-400 mt-2">{item.label}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-center gap-6 mt-6">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 ${data[0]?.color1} rounded`}></div>
          <span className="text-sm text-gray-300">{label1}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 ${data[0]?.color2} rounded`}></div>
          <span className="text-sm text-gray-300">{label2}</span>
        </div>
      </div>
    </div>
  );
}
