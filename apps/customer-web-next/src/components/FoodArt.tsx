import type { Cuisine } from "../data/preview";

/**
 * Lightweight, bundled preview imagery shown when external photos cannot be
 * loaded. Never replaces merchant-owned catalog photography after integration.
 */
export function FoodArt({kind,hero = false}: {kind:Cuisine;hero?:boolean}) {
  const burger = kind==="Burgers" || kind==="Snacks";
  const pizza = kind==="Pizza";
  const greens = kind==="Healthy";
  const drinks = kind==="Drinks";
  const dessert = kind==="Desserts";
  const bowl = kind==="Local";
  return (
    <svg className={hero?"dt-food-art dt-food-art--hero":"dt-food-art"} viewBox="0 0 320 175" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="dt-food-back" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#2a180e"/><stop offset=".52" stopColor="#57321c"/><stop offset="1" stopColor="#1c1712"/></linearGradient>
        <linearGradient id="dt-food-bun" x1=".1" y1="0" x2=".85" y2="1"><stop stopColor="#fbd389"/><stop offset=".5" stopColor="#d78027"/><stop offset="1" stopColor="#924817"/></linearGradient>
        <linearGradient id="dt-food-sauce" x1="0" x2="1"><stop stopColor="#ffbb44"/><stop offset="1" stopColor="#ee6a1e"/></linearGradient>
        <linearGradient id="dt-food-plate" x1="0" x2="1"><stop stopColor="#e1e1d8"/><stop offset="1" stopColor="#a8b1a0"/></linearGradient>
      </defs>
      <rect width="320" height="175" fill="url(#dt-food-back)"/>
      <path d="M-20 154 Q160 118 340 150 L340 190H-20Z" fill="#4e3020" opacity=".9"/>
      <ellipse cx="160" cy="153" rx="126" ry="14" fill="#0e0d0b" opacity=".38"/>
      <ellipse cx="160" cy="148" rx="119" ry="12" fill="url(#dt-food-plate)"/>
      {burger && <>
        <g transform={hero?"translate(0 -1) scale(1.02)":"translate(0 0)"}>
          <path d="M69 121 Q83 112 240 120 L237 141 Q167 152 80 143Z" fill="url(#dt-food-bun)" stroke="#a65019" strokeWidth="2"/>
          <path d="M72 118 Q91 105 106 118T140 116T177 118T215 117T247 119" fill="none" stroke="#55a629" strokeWidth="12" strokeLinecap="round"/>
          <path d="M73 108 Q159 93 249 108L247 121Q159 132 74 120Z" fill="#51280f"/>
          <path d="M84 100 Q165 85 238 101 L222 116 198 107 180 120 153 110 127 122 109 110 90 115Z" fill="url(#dt-food-sauce)"/>
          <path d="M82 96 Q164 83 242 96" fill="none" stroke="#c43826" strokeWidth="11" strokeLinecap="round"/>
          <path d="M80 92 Q102 86 115 94T147 91T184 90T215 93T244 92" fill="none" stroke="#76b72e" strokeWidth="12"/>
          <path d="M62 90 C66 46 102 25 164 24 C223 24 250 54 258 90Q161 101 62 90Z" fill="url(#dt-food-bun)" stroke="#b76324" strokeWidth="3"/>
          {[[99,58],[126,44],[166,53],[189,42],[219,64],[142,69],[189,75],[105,79],[237,80]].map(([x,y],index)=><ellipse key={index} cx={x} cy={y} rx="5" ry="2.2" transform={`rotate(-17 ${x} ${y})`} fill="#fff1ce" opacity=".88"/>)}
          <path d="M84 83 Q140 49 205 80" fill="none" stroke="#ffe4a1" strokeWidth="4" opacity=".2"/>
        </g>
      </>}
      {pizza && <>
        <ellipse cx="160" cy="91" rx="116" ry="73" fill="#b87435" stroke="#f9c66e" strokeWidth="8"/>
        <ellipse cx="160" cy="88" rx="105" ry="63" fill="#d94c27"/>
        {[[98,59],[150,47],[199,62],[220,91],[163,102],[113,111],[90,92],[185,128]].map(([x,y],index)=><g key={index}><circle cx={x} cy={y} r="17" fill="#be2f22" stroke="#89221b" strokeWidth="3"/><circle cx={x+5} cy={y+4} r="4" fill="#f6b759"/></g>)}
        {[[117,44],[200,50],[242,87],[158,133],[77,104],[140,80],[193,110]].map(([x,y],i)=><ellipse key={i} cx={x} cy={y} rx="13" ry="5" fill="#61a83a" transform={`rotate(${i*40} ${x} ${y})`}/>)}
        <path d="M160 24V151M51 81L262 112M246 42L76 133" stroke="#fae1b0" strokeWidth="2.2" opacity=".6"/>
      </>}
      {kind==="Chicken" && <>
        <ellipse cx="158" cy="109" rx="93" ry="48" fill="#9e4018" stroke="#d78233" strokeWidth="8"/>
        <path d="M73 110 Q87 48 149 53 Q204 54 241 101Q246 133 175 141 Q103 149 73 110Z" fill="#c9782c"/>
        <path d="M85 99 Q109 70 139 69 M118 123Q153 103 208 118 M161 79Q209 81 232 102" stroke="#efb058" strokeWidth="11" fill="none" strokeLinecap="round"/>
        {[[96,100],[130,84],[200,106],[150,124],[221,119]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="5" fill="#8c3617"/>)}
      </>}
      {bowl && <>
        <ellipse cx="160" cy="92" rx="99" ry="58" fill="#eee4cb"/>
        <ellipse cx="160" cy="90" rx="85" ry="47" fill="#653d24"/>
        {[[90,84,145,69],[120,99,192,75],[105,115,225,98],[129,65,213,116],[88,96,200,103]].map(([x,y,x2,y2],i)=><path key={i} d={`M${x} ${y} Q155 ${30+i*13} ${x2} ${y2}`} fill="none" stroke={i%2?"#e7b25f":"#efc976"} strokeWidth="6" strokeLinecap="round"/>)}
        {[[103,62],[211,83],[177,112],[126,120],[166,55]].map(([x,y],i)=><ellipse key={i} cx={x} cy={y} rx="17" ry="5" fill="#4ca054" transform={`rotate(${i*31} ${x} ${y})`}/>)}
        <path d="M70 104 Q82 162 160 166 Q240 164 251 104" fill="#f3ede2" stroke="#acb3ad" strokeWidth="4"/>
      </>}
      {greens && <>
        <ellipse cx="160" cy="111" rx="105" ry="50" fill="#e5e5d9"/>
        {[[102,80],[141,68],[180,75],[210,92],[123,112],[170,115],[216,116],[82,106]].map(([x,y],i)=><path key={i} d={`M${x-16} ${y+10}Q${x-24} ${y-19}${x+3} ${y-17}Q${x+25} ${y-3}${x+15} ${y+11}Z`} fill={i%2?"#4eac42":"#7ec95b"} stroke="#2e7f33" strokeWidth="2"/>)}
        {[[126,92],[202,110],[167,86],[91,115]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="11" fill="#e75230" stroke="#a9281d" strokeWidth="2"/>)}
        <path d="M55 123 Q69 171 161 173 Q246 168 264 123" fill="#efede3" stroke="#aab8af" strokeWidth="4"/>
      </>}
      {drinks && <>
        <path d="M93 62L232 62L212 144Q164 156 116 144Z" fill="#e9eee5" stroke="#c4cbbf" strokeWidth="5"/>
        <path d="M102 70L223 70L208 132Q164 141 120 133Z" fill="#95532a"/>
        <ellipse cx="163" cy="69" rx="62" ry="19" fill="#f6ede0"/><ellipse cx="163" cy="69" rx="45" ry="13" fill="#aa6d3d"/>
        <path d="M137 69Q167 49 187 69Q165 85 143 70" stroke="#f9f1e4" strokeWidth="6" fill="none"/>
        <path d="M230 73Q280 67 271 102Q262 125 223 119" stroke="#e5e4de" strokeWidth="12" fill="none"/>
      </>}
      {dessert && <>
        <path d="M89 92Q163 112 230 92L213 144Q160 163 106 144Z" fill="#c6d0ce" stroke="#e9edec" strokeWidth="5"/>
        <path d="M101 94Q129 71 138 94Q141 54 162 75Q191 49 192 92Q216 65 225 99" fill="#ffd1ce" stroke="#e7a7a1" strokeWidth="7"/>
        <path d="M114 108Q148 87 161 105Q182 92 213 111" stroke="#fff9f5" strokeWidth="13" strokeLinecap="round" fill="none"/>
        <circle cx="155" cy="62" r="12" fill="#e73e43"/><path d="M154 50L164 43" stroke="#317b36" strokeWidth="4"/>
      </>}
    </svg>
  );
}
