export function createPinIcon(imageUrl, size = 60) {

  const circle = size;
  const pointerHeight = size * 0.4;
  const total = size + pointerHeight;

  const svg = `
  <svg width="${size}" height="${total}" xmlns="http://www.w3.org/2000/svg">

    <defs>
      <clipPath id="clip">
        <circle cx="${size/2}" cy="${size/2}" r="${size/2}" />
      </clipPath>
    </defs>

    <!-- white border -->
    <circle cx="${size/2}" cy="${size/2}" r="${size/2-2}"
      fill="white" stroke="#3b82f6" stroke-width="3" />

    <!-- camera thumbnail -->
    <image href="${imageUrl}" width="${size}" height="${size}"
      clip-path="url(#clip)" preserveAspectRatio="xMidYMid slice"/>

    <!-- bottom pointer -->
    <path d="
      M ${size/2-8} ${circle}
      L ${size/2} ${total}
      L ${size/2+8} ${circle}
      Z
    "
      fill="#3b82f6" />
  </svg>
  `;

  return {
    url: "data:image/svg+xml;base64," + btoa(svg),
    scaledSize: new google.maps.Size(size, total),
    anchor: new google.maps.Point(size/2, total)  // pin bottom = location
  };
}
