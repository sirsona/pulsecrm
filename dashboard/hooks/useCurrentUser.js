// client/src/hooks/useCurrentUser.js
import { useEffect, useState } from "react";

export function useCurrentUser() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        setUser(null);
      }
    }
  }, []);

  return user;
}
