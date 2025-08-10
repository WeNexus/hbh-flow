export interface PathValue {
  path: string;
  value: any;
}

export function getOnlyValue(obj: any, path: string) {
  const pathArray = path.split('.');
  let result = obj;
  for (let i = 0; i < pathArray.length; i++) {
    const key = pathArray[i];
    if (key === '*') {
      const temp: any[] = [];
      for (let j = 0; j < result.length; j++) {
        const value = result[j];
        const nextValue = get(value, pathArray.slice(i + 1).join('.'));
        if (Array.isArray(nextValue)) {
          temp.push(...nextValue);
        } else {
          temp.push(nextValue);
        }
      }
      return temp;
    }
    result = result[key];
  }
  return result;
}

export function get(obj: any, path: string): PathValue[] {
  const pathArray = path.split('.');
  const result: PathValue[] = [];

  function _get(obj: any, pathArray: string[], currentPath: string) {
    if (pathArray.length === 0) {
      result.push({ path: currentPath.slice(1), value: obj });
      return;
    }
    const key = pathArray[0];
    if (key === '*') {
      for (let i = 0; i < obj.length; i++) {
        const value = obj[i];
        _get(value, pathArray.slice(1), `${currentPath}.${i}`);
      }
    } else {
      _get(obj[key], pathArray.slice(1), `${currentPath}.${key}`);
    }
  }

  _get(obj, pathArray, '');

  return result;
}

export function remove(obj: any, path: string) {
  const pathArray = path.split('.');
  let result = obj;
  for (let i = 0; i < pathArray.length; i++) {
    const key = pathArray[i];
    if (key === '*') {
      for (let j = 0; j < result.length; j++) {
        const value = result[j];
        remove(value, pathArray.slice(i + 1).join('.'));
      }
      return;
    }
    if (i === pathArray.length - 1) {
      if (!Array.isArray(result)) {
        delete result[key];
      } else {
        result.splice(parseInt(key), 1);
      }
      return;
    }
    result = result[key];
  }
}
