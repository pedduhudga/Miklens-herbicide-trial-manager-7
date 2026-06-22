/**
 * VirtualizedList - A reusable virtualized list component
 * Renders only visible items plus overscan buffer for performance
 */

import React, { useState, useEffect, useRef, useCallback, memo } from 'react';

const DEFAULT_ITEM_HEIGHT = 80;
const DEFAULT_OVERSCAN = 5;

/**
 * VirtualizedList Component
 * @param {Array} items - Array of items to render
 * @param {Function} renderItem - Function to render each item
 * @param {number} itemHeight - Fixed height of each item (or function for dynamic heights)
 * @param {number} overscan - Number of items to render outside visible area
 * @param {string} className - Additional CSS class
 * @param {React.ReactNode} emptyMessage - Message to show when list is empty
 */
export const VirtualizedList = memo(function VirtualizedList({
  items = [],
  renderItem,
  itemHeight = DEFAULT_ITEM_HEIGHT,
  overscan = DEFAULT_OVERSCAN,
  className = '',
  emptyMessage = 'No items to display',
  style = {}
}) {
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Handle resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });

    resizeObserver.observe(container);
    setContainerHeight(container.clientHeight);

    return () => resizeObserver.disconnect();
  }, []);

  // Handle scroll
  const handleScroll = useCallback((e) => {
    setScrollTop(e.target.scrollTop);
  }, []);

  // Calculate item height (support fixed or dynamic)
  const getItemHeight = useCallback((index) => {
    if (typeof itemHeight === 'function') {
      return itemHeight(items[index], index);
    }
    return itemHeight;
  }, [items, itemHeight]);

  // Calculate visible range
  const getVisibleRange = useCallback(() => {
    if (items.length === 0 || containerHeight === 0) {
      return { startIndex: 0, endIndex: 0 };
    }

    let totalHeight = 0;
    let startIndex = 0;
    let endIndex = 0;

    // Find start index
    for (let i = 0; i < items.length; i++) {
      const height = getItemHeight(i);
      if (totalHeight + height > scrollTop) {
        startIndex = Math.max(0, i - overscan);
        break;
      }
      totalHeight += height;
    }

    // Find end index
    totalHeight = 0;
    for (let i = 0; i < items.length; i++) {
      const height = getItemHeight(i);
      if (totalHeight >= scrollTop + containerHeight) {
        endIndex = Math.min(items.length, i + overscan);
        break;
      }
      totalHeight += height;
      endIndex = i + 1;
    }

    return {
      startIndex,
      endIndex: Math.min(items.length, endIndex)
    };
  }, [items.length, scrollTop, containerHeight, getItemHeight, overscan]);

  // Calculate total height and offset
  const getTotalHeight = useCallback(() => {
    let total = 0;
    for (let i = 0; i < items.length; i++) {
      total += getItemHeight(i);
    }
    return total;
  }, [items, getItemHeight]);

  const { startIndex, endIndex } = getVisibleRange();
  const totalHeight = getTotalHeight();

  // Calculate offset for first visible item
  const getOffset = useCallback((index) => {
    let offset = 0;
    for (let i = 0; i < index; i++) {
      offset += getItemHeight(i);
    }
    return offset;
  }, [getItemHeight]);

  // Render items
  const visibleItems = [];
  for (let i = startIndex; i < endIndex; i++) {
    const item = items[i];
    const style = {
      position: 'absolute',
      top: getOffset(i),
      left: 0,
      right: 0,
      height: getItemHeight(i)
    };
    visibleItems.push(
      <div key={i} style={style}>
        {renderItem(item, i)}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={`virtualized-list-empty ${className}`} style={style}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`virtualized-list ${className}`}
      onScroll={handleScroll}
      style={{
        overflow: 'auto',
        position: 'relative',
        ...style
      }}
    >
      <div
        style={{
          height: totalHeight,
          position: 'relative'
        }}
      >
        {visibleItems}
      </div>
    </div>
  );
});

/**
 * VirtualizedGrid - A grid version of virtualized list
 */
export const VirtualizedGrid = memo(function VirtualizedGrid({
  items = [],
  renderItem,
  columns = 3,
  itemHeight = 200,
  overscan = 2,
  className = '',
  emptyMessage = 'No items to display',
  style = {}
}) {
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);

  // Handle resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
        setContainerWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(container);
    setContainerHeight(container.clientHeight);
    setContainerWidth(container.clientWidth);

    return () => resizeObserver.disconnect();
  }, []);

  // Handle scroll
  const handleScroll = useCallback((e) => {
    setScrollTop(e.target.scrollTop);
  }, []);

  // Calculate visible range
  const getVisibleRange = useCallback(() => {
    if (items.length === 0 || containerHeight === 0 || containerWidth === 0) {
      return { startIndex: 0, endIndex: 0 };
    }

    const itemWidth = containerWidth / columns;
    const rowHeight = itemHeight;
    
    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const endRow = Math.min(
      Math.ceil(items.length / columns),
      Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan
    );

    return {
      startIndex: startRow * columns,
      endIndex: Math.min(items.length, endRow * columns)
    };
  }, [items.length, scrollTop, containerHeight, containerWidth, columns, itemHeight, overscan]);

  const { startIndex, endIndex } = getVisibleRange();
  const rowHeight = itemHeight;

  if (items.length === 0) {
    return (
      <div className={`virtualized-grid-empty ${className}`} style={style}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`virtualized-grid ${className}`}
      onScroll={handleScroll}
      style={{
        overflow: 'auto',
        position: 'relative',
        ...style
      }}
    >
      <div
        style={{
          height: Math.ceil(items.length / columns) * rowHeight,
          position: 'relative'
        }}
      >
        {Array.from({ length: endIndex - startIndex }, (_, i) => {
          const index = startIndex + i;
          if (index >= items.length) return null;
          
          const row = Math.floor(index / columns);
          const col = index % columns;
          const itemWidth = containerWidth / columns;

          return (
            <div
              key={index}
              style={{
                position: 'absolute',
                top: row * rowHeight,
                left: col * itemWidth,
                width: itemWidth,
                height: rowHeight
              }}
            >
              {renderItem(items[index], index)}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default VirtualizedList;