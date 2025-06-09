import React, { useState, useEffect } from "react";

export function SelectOption({
  options = [],
  CustomText = "",
  multiSelect = false,
  disabled = false,
  storageKey = null, // Added storageKey to props destructuring
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(""); // For single select
  const [values, setValues] = useState([]); // For multi-select, changed from setvalues to setValues
  const [selectedIcon, setSelectedIcon] = useState();

  // Ensure options is an array
  const validOptions = Array.isArray(options) ? options : [];
  
  // Effect to load initial selections from localStorage
  useEffect(() => {
    if (storageKey) {
      try {
        const storedValueString = localStorage.getItem(storageKey);
        if (storedValueString) {
          const storedValue = JSON.parse(storedValueString);
          if (multiSelect && Array.isArray(storedValue)) {
            // Expecting an array of full option objects for multi-select
            // We need to extract just the 'value' part for the 'values' state
            const storedOptionValues = storedValue.map(opt => opt.value);
            setValues(storedOptionValues);
          } else if (!multiSelect && storedValue && typeof storedValue.value !== 'undefined') {
            // Expecting a single option object for single-select
            setValue(storedValue.value);
            if (storedValue.icon) setSelectedIcon(storedValue.icon);
          }
        }
      } catch (error) {
        console.error(`Error loading initial selections for ${storageKey} from localStorage:`, error);
      }
    }
  }, [storageKey, multiSelect]); 


  useEffect(() => {
    if (storageKey) {
      try {
        if (multiSelect) {

          if (validOptions.length > 0 && values.length > 0) {
            const fullSelectedOptions = validOptions.filter(option => values.includes(option.value));

            if (fullSelectedOptions.length === values.length || values.every(v => validOptions.some(opt => opt.value === v))){
                localStorage.setItem(storageKey, JSON.stringify(fullSelectedOptions));
            }
          } else if (values.length === 0) {
            localStorage.removeItem(storageKey);
          }
        } else {
          // Single-select logic
          if (validOptions.length > 0 && value) {
            const fullSelectedOption = validOptions.find(option => option.value === value);
            if (fullSelectedOption) { 
              localStorage.setItem(storageKey, JSON.stringify(fullSelectedOption));
            }
            // If value exists but not in validOptions, do not save (prevents writing stale data)
          } else if (value === "") { 
            localStorage.removeItem(storageKey);
          }
          // If validOptions is empty but value has an item, we don't save.
        }
      } catch (error) {
        console.error(`Error saving selections for ${storageKey} to localStorage:`, error);
      }
    }
  }, [value, values, storageKey, multiSelect, validOptions]);

  const selectedOption = validOptions.find((option) => option.value === value);
  const selectedOptions = validOptions.filter((option) =>
    values.includes(option.value)
  );

  // checkPlatform value on LocalStorage 
  const platform = localStorage.getItem("platform");
  const checkPlatformValue = platform? platform : "";

  // Update selectedIcon when selectedOption changes
  useEffect(() => {
    if (!multiSelect && selectedOption && selectedOption.icon) {
      setSelectedIcon(selectedOption.icon);
    } else if (!multiSelect && !selectedOption) {
      setSelectedIcon(undefined); // Clear icon if no option is selected
    }
  }, [selectedOption, multiSelect]);

  // For connect button logic
  const connectOption = multiSelect
    ? selectedOptions.length > 0 ? selectedOptions[0] : null
    : selectedOption || null;

  const handleRemoveItem = (optionValue) => {
    setValues(values.filter(val => val !== optionValue));
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
                  <div key={option.value} className="bg-gray-100 gap-1 flex items-center rounded-md mt-2 w-fit p-1 text-xs">
                    {option.icon && <img src={option.icon} alt="" className="w-3 h-3 mr-1" />}
                    <span>{option.label}</span>
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
                        setValues((prevSelectedValues) => [
                          ...new Set([...prevSelectedValues, option.value]),
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
                  className="w-full mt-1 px-2 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 font-medium border-t"
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
      {!open && connectOption && (
        <div>
          <a
            onClick={() => {
              if (!multiSelect && selectedOption) {
                 localStorage.setItem("platform", selectedOption.label);
              }
            }}
            href={multiSelect && connectOption ? connectOption.href : selectedOption ? `${selectedOption.href}?platform=${selectedOption.label}` : '#'}
            className="flex gap-2 bg-gray-900 hover:bg-gray-950 text-white text-sm w-fit p-2 mt-2 rounded"
          >
            {connectOption?.icon && <img src={connectOption.icon} alt="" className="w-4 h-4" />}
            <button type="button">Connect {CustomText}</button>
          </a>
        </div>
      )}
    </div>
  );
}
