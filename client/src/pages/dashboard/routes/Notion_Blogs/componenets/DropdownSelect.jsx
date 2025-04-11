import React, { useState, useEffect } from "react";
import { data } from "react-router-dom";

export function SelectOption({
  options = [],
  CustomText = "",
  multiSelect = false,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [selectedIcon, setSelectedIcon] = useState();
  const [values, setvalues] = useState([]);
  const [connectCollection, setConnectCollection] = useState([]);

  // Debug options passed to component
  console.log("SelectOption received options:", options);

  // Make sure options is an array
  const validOptions = Array.isArray(options) ? options : [];
  console.log("validOptions after array check:", validOptions);
  
  const selectedOption = validOptions.find((option) => option.value === value);
  const selectedOptions = validOptions.filter((option) =>
    values.includes(option.value)
  );

  // checkPlatform value on LocalStorage 
  const platform = localStorage.getItem("platform");
  const checkPlatformValue = platform? platform : "";

  // Update selectedIcon when selectedOption changes
  useEffect(() => {
    if (selectedOption && selectedOption.icon) {
      setSelectedIcon(selectedOption.icon);
    }
  }, [selectedOption]);

  // For connect button logic
  const connectOption = multiSelect
    ? selectedOptions.length > 0 ? selectedOptions[0] : null
    : selectedOption || null;

  const handleRemoveItem = (optionValue) => {
    setvalues(values.filter(val => val !== optionValue));
  };

  return (
    <div className="relative w-[200px]">
      {/* Dropdown button */}
      <div
        className="flex w-fit items-center gap-1 mb-6 hover:bg-gray-100 cursor-pointer px-2 py-1 rounded"
        onClick={() => setOpen(!open)}
        variant="outline"
      >
        {multiSelect ? (
          <div className="max-w-40">
            {selectedOptions.length > 0 
              ? selectedOptions.map((option) => (
                  <div key={option.value} className="bg-gray-100 gap-5 rounded-md mt-2 w-fit p-1">
                    {option.icon && <img src={option.icon} alt="" className="w-4 h-4 mr-1" />}
                    {option.label}
                  </div>
                ))
              : "Select CMS..."}
          </div>
        ) : (
          <div className="flex items-center">
            {selectedIcon && (
              <img src={selectedIcon} alt="" className="w-4 h-4 mr-2" />
            )}
            { checkPlatformValue ? checkPlatformValue : selectedOption ? selectedOption.label : "Select option..."
            }
          </div>
        )}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`ml-2 h-4 w-4 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>

      {/* Dropdown menu */}
      {open && (
        <div className="absolute top-full mt-1 w-full rounded-md border bg-white shadow-md z-10">
          {validOptions.length === 0 ? (
            <div className="py-2 px-3 text-sm text-gray-500">
              No options available
            </div>
          ) : (
            <ul className="py-1 max-h-60 overflow-auto">
              {validOptions.map((option) => (
                <li
                  key={option.value}
                  className={`px-2 py-1.5 text-sm cursor-pointer hover:bg-gray-100 flex items-center ${
                    multiSelect 
                      ? values.includes(option.value) ? "bg-gray-100 font-medium" : ""
                      : value === option.value ? "bg-gray-100 font-medium" : ""
                  }`}
                  onClick={() => {
                    if (multiSelect) {
                      if (values.includes(option.value)) {
                        handleRemoveItem(option.value);
                      } else {
                        setvalues((prevValue) => [
                          ...new Set([...prevValue, option.value]),
                        ]);
                      }
                    } else {
                      setValue(option.value);
                      if (option.icon) setSelectedIcon(option.icon);
                      setOpen(false);
                    }
                  }}
                >
                  {option.icon && (
                    <img src={option.icon} alt="" className="w-4 h-4 mr-2" />
                  )}
                  <span>{option.label}</span>
                  {multiSelect && values.includes(option.value) && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg" 
                      width="16" 
                      height="16" 
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="ml-auto"
                    >
                      <path d="M5 12l5 5 9-9" />
                    </svg>
                  )}
                </li>
              ))}
              {multiSelect && (
                <button
                  className="w-full px-2 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 font-medium"
                  onClick={() => {
                    setOpen(false);
                  }}
                >
                  Done
                </button>
              )}
            </ul>
          )}
        </div>
      )}

      {/* Connect button - only shows if a platform is selected */} 
      {!open && connectOption && (
        <div>
          <a
            onClick={() => {
              if (multiSelect) {
                 //Filter ConnectedCollections from localstorage
                const Collections = JSON.parse(localStorage.getItem("webflowCollections"));
                console.log("Collections from localStorage:", Collections);
                console.log("Selected options:", selectedOptions);
                
                // This comparison won't work, fixing it
                const savedCollections = selectedOptions.map(option => ({
                  id: option.value,
                  name: option.label
                }));
                console.log("Saving to localStorage:", savedCollections);
                localStorage.setItem("selectedCollectionsForNotion", JSON.stringify(savedCollections));

              } else {
                localStorage.setItem("platform", selectedOption.label);
              }
            }}
            href={multiSelect ? connectOption.href : `${selectedOption.href}?platform=${selectedOption.label}`}
            className="flex gap-2 bg-gray-900 hover:bg-gray-950 text-white text-sm w-fit p-2"
          >
            {multiSelect ? (
              connectOption.icon && <img src={connectOption.icon} alt="" className="w-4 h-4 mr-2" />
            ) : (
              selectedOption.icon && <img src={selectedOption.icon} alt="" className="w-4 h-4 mr-2" />
            )}
            <button>Connect {CustomText}</button>
          </a>
        </div>
      )}
    </div>
  );
}
