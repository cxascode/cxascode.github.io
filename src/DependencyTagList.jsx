import React from "react";

function handleDependencyTagKeyDown(event, resourceType, onSelectType) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  onSelectType(resourceType);
}

export default function DependencyTagList({ types, onSelectType }) {
  return (
    <ul className="gcDependencyTagList">
      {types.map((resourceType) => (
        <li key={resourceType} className="gcDependencyTag">
          <button
            type="button"
            className="gcDependencyTag__button"
            title={resourceType}
            onClick={() => onSelectType(resourceType)}
            onKeyDown={(event) => handleDependencyTagKeyDown(event, resourceType, onSelectType)}
          >
            <span className="gcDependencyTag__label">{resourceType}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
