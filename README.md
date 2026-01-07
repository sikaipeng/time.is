# World Clock - Multi-Timezone Dashboard
A lightweight, responsive world clock application that displays real-time time for cities across different timezones, with server time synchronization for accuracy.

## ✨ Features
- Real-time time display for 15+ major global cities
- Automatic server time synchronization (with fallback to local system time)
- Responsive design for desktop and mobile devices
- Multi-language support (Traditional Chinese, Simplified Chinese, English)
- Visual timezone offset display (UTC±HH:MM)
- Interactive city tag cloud with hover animations

## 🚀 Demo
Simply open the `index.html` file in any modern web browser - no build tools or dependencies required.

## 📋 Requirements
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Internet connection (for server time synchronization)

## 🎯 Usage
1. Download or clone the repository
2. Open `index.html` in your web browser
3. Click on any city tag to switch the displayed timezone
4. The clock automatically updates every second
5. Time syncs with remote server on load (and every 10 minutes thereafter)

## 🗺 Supported Cities/Timezones
- Los Angeles (America/Los_Angeles)
- San Francisco (America/Los_Angeles)
- Vancouver (America/Vancouver)
- Chicago (America/Chicago)
- New York (America/New_York)
- Toronto (America/Toronto)
- Rio de Janeiro (America/Sao_Paulo)
- Sao Paulo (America/Sao_Paulo)
- London (Europe/London)
- Paris (Europe/Paris)
- Berlin (Europe/Berlin)
- Rome (Europe/Rome)
- Moscow (Europe/Moscow)
- Dubai (Asia/Dubai)
- New Delhi (Asia/Kolkata)
- Bangkok (Asia/Bangkok)
- Singapore (Asia/Singapore)
- Beijing (Asia/Shanghai)
- Shanghai (Asia/Shanghai)
- Hong Kong (Asia/Hong_Kong)
- Taipei (Asia/Taipei)
- Tokyo (Asia/Tokyo)
- Seoul (Asia/Seoul)
- Sydney (Australia/Sydney)
- Melbourne (Australia/Melbourne)

## 🎨 Design
- Clean, minimalist UI with subtle shadows and hover effects
- Responsive typography that scales with screen size
- High contrast time display with monospaced font for readability
- Interactive city tags with smooth animations

## ⚙ Technical Details
- Pure HTML/CSS/JavaScript (no frameworks/libraries)
- Uses `Intl.DateTimeFormat` for accurate timezone handling
- Implements network latency compensation for server time sync
- CSS custom properties for consistent styling
- Debounced resize handling for responsive layout

## 📄 License
This project is open source and available under the MIT License.
