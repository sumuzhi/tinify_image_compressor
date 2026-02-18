import zipfile
import os
import sys

def package_extension():
    package_name = "tinify-extension.zip"
    
    # Files strictly required for the extension
    files_to_include = [
        "manifest.json",
        "index.html",
        "style.css",
        "script.js",
        "background.js",
        "jszip.min.js"
    ]
    
    # Optional files
    if os.path.exists("README.md"):
        files_to_include.append("README.md")
        
    # Include icons if they exist
    if os.path.exists("icons"):
        for root, _, files in os.walk("icons"):
            for file in files:
                if not file.startswith('.'): # Ignore hidden files like .DS_Store
                    files_to_include.append(os.path.join(root, file))

    print(f"📦 Packaging extension into '{package_name}'...")
    print("-" * 40)

    try:
        # Create the zip file
        with zipfile.ZipFile(package_name, 'w', zipfile.ZIP_DEFLATED) as zf:
            for file_path in files_to_include:
                if os.path.exists(file_path):
                    print(f"  ✅ Adding: {file_path}")
                    zf.write(file_path)
                else:
                    print(f"  ⚠️  Warning: File not found: {file_path}")
        
        print("-" * 40)
        file_size = os.path.getsize(package_name) / 1024
        print(f"🎉 Success! Package created at: {os.path.abspath(package_name)}")
        print(f"📊 Size: {file_size:.2f} KB")
        print("\n🚀 Ready to publish to:")
        print("  - Microsoft Edge Add-ons: https://partner.microsoft.com/dashboard/microsoftedge/addons")
        print("  - Chrome Web Store: https://chrome.google.com/webstore/devconsole")
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    package_extension()
