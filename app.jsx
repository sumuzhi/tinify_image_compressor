const { useState, useEffect, useRef, useCallback } = React;

// DB Configuration for IndexedDB to store file blobs
const DB_NAME = 'TinifyCompressorDB';
const DB_VERSION = 1;
const STORE_NAME = 'files';

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

const saveFileToDB = async (fileData) => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await store.put(fileData);
    return true;
  } catch (err) {
    console.error('Failed to save file to DB:', err);
    return false;
  }
};

const getAllFilesFromDB = async () => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Failed to load files from DB:', err);
    return [];
  }
};

const deleteFileFromDB = async (id) => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await store.delete(id);
  } catch (err) {
    console.error('Failed to delete file from DB:', err);
  }
};

const clearDB = async () => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await store.clear();
  } catch (err) {
    console.error('Failed to clear DB:', err);
  }
};

// Components
const Icon = ({ name, className = '' }) => {
  const svgContent = window.TINIFY_ICONS && window.TINIFY_ICONS[name];
  if (!svgContent) return null;
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: svgContent }}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: '1' }}
    />
  );
};

const Button = ({
  children,
  onClick,
  disabled,
  variant = 'primary',
  className = '',
}) => {
  const baseStyle =
    'px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed';
  const variants = {
    primary:
      'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow-md',
    secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200',
    ghost: 'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyle} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

const ProgressBar = ({ progress, status }) => {
  const isIndeterminate = status === 'compressing' && progress === 0;

  return (
    <div className='h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mt-2'>
      <div
        className={`h-full rounded-full transition-all duration-300 ${
          status === 'error'
            ? 'bg-red-500'
            : status === 'success'
              ? 'bg-green-500'
              : 'bg-blue-500'
        } ${isIndeterminate ? 'animate-pulse w-full' : ''}`}
        style={{ width: isIndeterminate ? '100%' : `${progress}%` }}
      />
    </div>
  );
};

const FileItem = ({ item, onRemove }) => {
  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const saving =
    item.compressedSize > 0
      ? (
          ((item.originalSize - item.compressedSize) / item.originalSize) *
          100
        ).toFixed(1)
      : 0;

  return (
    <div className='bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between group'>
      <div className='flex items-center gap-4 flex-1 min-w-0'>
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
            item.status === 'success'
              ? 'bg-green-100 text-green-600'
              : item.status === 'error'
                ? 'bg-red-100 text-red-600'
                : 'bg-blue-50 text-blue-600'
          }`}
        >
          <Icon
            name={
              item.status === 'success'
                ? 'check-circle'
                : item.status === 'error'
                  ? 'warning-circle'
                  : 'image'
            }
            className="text-xl"
          />
        </div>

        <div className='flex-1 min-w-0'>
          <div className='flex items-center justify-between mb-1'>
            <p
              className='font-medium text-gray-900 truncate pr-4'
              title={item.name}
            >
              {item.name}
            </p>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                item.status === 'success'
                  ? 'bg-green-100 text-green-700'
                  : item.status === 'error'
                    ? 'bg-red-100 text-red-700'
                    : item.status === 'compressing'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-600'
              }`}
            >
              {item.status === 'success'
                ? `-${saving}%`
                : item.status === 'error'
                  ? '失败'
                  : item.status === 'compressing'
                    ? '压缩中'
                    : '等待中'}
            </span>
          </div>

          <div className='flex items-center justify-between text-xs text-gray-500'>
            <span>
              {formatSize(item.originalSize)}{' '}
              {item.compressedSize > 0 &&
                `→ ${formatSize(item.compressedSize)}`}
            </span>
            {item.status === 'error' && (
              <span className='text-red-500 truncate max-w-[200px]'>
                {item.error}
              </span>
            )}
          </div>

          {item.status === 'compressing' && (
            <ProgressBar progress={0} status={item.status} />
          )}
        </div>
      </div>

      <div className='flex items-center gap-2 ml-4'>
        {item.status === 'success' && (
          <button
            onClick={() => {
              if (window.chrome && chrome.downloads) {
                chrome.downloads.download({
                  url: item.url,
                  filename: item.name
                });
              } else {
                // Fallback for non-extension environment
                const a = document.createElement('a');
                a.href = item.url;
                a.download = item.name;
                a.target = '_blank';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              }
            }}
            className='p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors'
            title='下载'
          >
            <Icon name='download-simple' className='text-xl' />
          </button>
        )}
        <button
          onClick={() => onRemove(item.id)}
          className='p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors'
          title='删除'
        >
          <Icon name='trash' className='text-xl' />
        </button>
      </div>
    </div>
  );
};

const App = () => {
  const [apiKey, setApiKey] = useState('');
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  // Load initial data
  useEffect(() => {
    const savedKey = localStorage.getItem('tinify_api_key');
    if (savedKey) setApiKey(savedKey);

    const loadFiles = async () => {
      const savedFiles = await getAllFilesFromDB();
      // Revoke old object URLs to avoid memory leaks if we stored them (we don't store URLs in DB, just blobs)
      // Re-create object URLs for blobs if needed, but here we might just have raw data
      // Actually, we can't store Blobs directly in localStorage, so we used IndexedDB
      setFiles(savedFiles);
    };
    loadFiles();
  }, []);

  // Save API Key
  const handleApiKeyChange = (e) => {
    const newKey = e.target.value.trim();
    setApiKey(newKey);
    localStorage.setItem('tinify_api_key', newKey);
  };

  const processNewFiles = async (fileList) => {
    const newFiles = [];
    for (const file of fileList) {
      if (
        !file.type.startsWith('image/') &&
        !/\.(png|jpe?g|webp)$/i.test(file.name)
      )
        continue;

      // Simple check for duplicates
      const isDuplicate = files.some(
        (f) => f.name === file.name && f.originalSize === file.size,
      );
      if (isDuplicate) continue;

      const id = crypto.randomUUID();
      const fileData = {
        id,
        name: file.name,
        originalSize: file.size,
        type: file.type,
        status: 'pending',
        compressedSize: 0,
        url: null,
        error: null,
        timestamp: Date.now(),
        fileBlob: file, // Store blob in IndexedDB
      };

      await saveFileToDB(fileData);
      newFiles.push(fileData);
    }

    if (newFiles.length > 0) {
      setFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files) {
      processNewFiles(Array.from(e.target.files));
    }
    e.target.value = '';
  };

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragging(false);

      const items = e.dataTransfer.items;
      const fileList = [];

      // Simple handling for now - just get files
      if (e.dataTransfer.files) {
        processNewFiles(Array.from(e.dataTransfer.files));
      }
    },
    [files],
  ); // Dependency on files for duplicate check in processNewFiles (though processNewFiles uses current state via setFiles updater if written correctly, but here we read 'files' state directly inside processNewFiles so we need it in dependency or refactor)

  const removeFile = async (id) => {
    await deleteFileFromDB(id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const clearAll = async () => {
    if (confirm('确定要清空所有记录吗？')) {
      await clearDB();
      setFiles([]);
    }
  };

  const compressFile = async (fileItem) => {
    const useProxy = !apiKey;
    const url = useProxy ? 'http://localhost:3000/api/compress' : 'https://api.tinify.com/shrink';

    try {
      // Update status to compressing
      const updatedItem = { ...fileItem, status: 'compressing', error: null };
      setFiles((prev) =>
        prev.map((f) => (f.id === fileItem.id ? updatedItem : f)),
      );

      const headers = {};
      if (!useProxy) {
        headers['Authorization'] = 'Basic ' + btoa('api:' + apiKey);
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: fileItem.fileBlob,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || response.statusText);
      }

      const data = await response.json();
      console.log("🚀 ~ compressFile ~ data:", data)

      if (data.output && data.output.url) {
        const successItem = {
          ...updatedItem,
          status: 'success',
          compressedSize: data.output.size,
          url: data.output.url,
        };
        // Update DB with success state
        await saveFileToDB(successItem);
        return successItem;
      } else {
        throw new Error('Invalid response');
      }
    } catch (error) {
      const errorItem = {
        ...fileItem,
        status: 'error',
        error: error.message,
      };
      await saveFileToDB(errorItem);
      return errorItem;
    }
  };

  const startCompression = async () => {
    setIsProcessing(true);
    const pendingFiles = files.filter(
      (f) => f.status === 'pending' || f.status === 'error',
    );

    // Process sequentially to avoid rate limits/browser issues
    for (const file of pendingFiles) {
      const result = await compressFile(file);
      setFiles((prev) => prev.map((f) => (f.id === result.id ? result : f)));
    }
    setIsProcessing(false);
  };

  const downloadAll = async () => {
    const successFiles = files.filter((f) => f.status === 'success');
    if (successFiles.length === 0) return;

    const zip = new JSZip();
    const folder = zip.folder('tinify_compressed');

    // Show loading state...
    const btn = document.getElementById('download-all-btn');
    const originalText = btn.innerText;
    btn.innerText = '打包中...';
    btn.disabled = true;

    try {
      const promises = successFiles.map(async (item) => {
        try {
          const response = await fetch(item.url);
          const blob = await response.blob();
          folder.file(item.name, blob);
        } catch (e) {
          console.error('Download failed for', item.name, e);
        }
      });

      await Promise.all(promises);
      const content = await zip.generateAsync({ type: 'blob' });

      const url = URL.createObjectURL(content);

      if (window.chrome && chrome.downloads) {
        chrome.downloads.download({
          url: url,
          filename: 'tinify_images.zip'
        });
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tinify_images.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      
      // Revoke URL after a delay
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      alert('打包下载失败');
    } finally {
      btn.innerText = originalText;
      btn.disabled = false;
    }
  };

  return (
    <div className='max-w-4xl mx-auto p-6 space-y-8'>
      {/* Header */}
      <div className='text-center space-y-2'>
        <div className='inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200 mb-4'>
          <Icon name='images' className='text-3xl' />
        </div>
        <h1 className='text-3xl font-bold text-gray-900'>Tinify 图片压缩</h1>
        <p className='text-gray-500'>
          高效、批量、无损压缩您的 PNG 和 JPEG 图片
        </p>
      </div>

      {/* API Key Input */}
      <div className='bg-white rounded-xl p-6 shadow-sm border border-gray-100'>
        <label className='block text-sm font-medium text-gray-700 mb-2'>
          Tinify API Key
          <span className='text-gray-400 font-normal ml-2'>
            (可选 - 留空使用本地代理)
          </span>
        </label>
        <div className='relative'>
          <input
            type='password'
            value={apiKey}
            onChange={handleApiKeyChange}
            placeholder='请输入 API Key（可选）'
            className='w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none'
          />
          <Icon name='key' className='absolute left-3.5 top-3 text-gray-400 text-lg' />
        </div>
      </div>

      {/* Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200 cursor-pointer ${
          isDragging
            ? 'border-blue-500 bg-blue-50 scale-[1.01]'
            : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50 bg-white'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type='file'
          multiple
          accept='image/png, image/jpeg, image/webp'
          className='hidden'
          ref={fileInputRef}
          onChange={handleFileSelect}
        />
        <input
          type='file'
          webkitdirectory=''
          directory=''
          multiple
          className='hidden'
          ref={folderInputRef}
          onChange={handleFileSelect}
        />

        <div className='w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4'>
          <Icon name='cloud-arrow-up' className='text-3xl' />
        </div>
        <h3 className='text-lg font-medium text-gray-900 mb-1'>
          点击或拖拽图片到这里
        </h3>
        <p className='text-gray-500 text-sm mb-4'>支持 JPG, PNG, WebP</p>

        <div className='flex justify-center gap-3'>
          <Button
            variant='secondary'
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
          >
            <Icon name='image' /> 选择文件
          </Button>
          <Button
            variant='secondary'
            onClick={(e) => {
              e.stopPropagation();
              folderInputRef.current?.click();
            }}
          >
            <Icon name='folder' /> 选择文件夹
          </Button>
        </div>
      </div>

      {/* Actions & Stats */}
      {files.length > 0 && (
        <div className='flex items-center justify-between bg-white p-4 rounded-xl border border-gray-100 shadow-sm sticky top-4 z-10'>
          <div className='text-sm text-gray-600 font-medium'>
            <span className='bg-gray-100 px-2 py-1 rounded-md mr-2'>
              {files.length} 个文件
            </span>
            <span className='text-green-600'>
              {files.filter((f) => f.status === 'success').length} 完成
            </span>
          </div>
          <div className='flex gap-2'>
            <Button
              onClick={startCompression}
              disabled={
                isProcessing ||
                !files.some(
                  (f) => f.status === 'pending' || f.status === 'error',
                )
              }
            >
              {isProcessing ? (
                <>
                  <Icon name='spinner' className='animate-spin' /> 处理中...
                </>
              ) : (
                <>
                  <Icon name='play' /> 开始压缩
                </>
              )}
            </Button>
            <Button
              id='download-all-btn'
              variant='secondary'
              onClick={downloadAll}
              disabled={!files.some((f) => f.status === 'success')}
            >
              <Icon name='download' /> 全部下载
            </Button>
            <Button variant='danger' onClick={clearAll} disabled={isProcessing}>
              <Icon name='trash' /> 清空
            </Button>
          </div>
        </div>
      )}

      {/* File List */}
      <div className='space-y-3 pb-20'>
        {files.map((file) => (
          <FileItem key={file.id} item={file} onRemove={removeFile} />
        ))}
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
