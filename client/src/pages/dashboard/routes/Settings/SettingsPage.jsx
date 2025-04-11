import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function SettingsPage() {
  const navigate = useNavigate();

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Settings</h1>
      <p>Settings content will go here.</p>
      <button onClick={() => {
        navigate('/logout');
      }}
      type="button"
        className="bg-blue-500 text-white px-4 py-2 rounded-md">
        Logout
      </button>
    </div>
  );
} 