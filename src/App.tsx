import { useEffect } from "react";
import { Router } from "./components/layout/Router";
import { AllWalletsProvider } from "./services/AllWalletsProvider";

function App() {
  // 🌐 Track website visits for analytics
  useEffect(() => {
    const trackVisit = async () => {
      try {
        const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001/api';
        
        const response = await fetch(`${backendUrl}/track-visit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          // Send minimal data, IP will be detected server-side
          body: JSON.stringify({
            timestamp: new Date().toISOString(),
            referrer: document.referrer || 'Direct',
            page: window.location.pathname
          })
        });

        const result = await response.json();
        if (result.success) {
          console.log('🌐 Visit tracked:', result.location || 'Location unknown');
        }
      } catch (error) {
        // Silently fail to not disrupt user experience
        console.log('Visit tracking unavailable');
      }
    };

    // Track visit after a short delay to ensure page is fully loaded
    const timeoutId = setTimeout(trackVisit, 1000);
    
    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <AllWalletsProvider>
      <Router />
    </AllWalletsProvider>
  );
}

export default App;