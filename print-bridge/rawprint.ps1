param(
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [Parameter(Mandatory = $true)][string]$FilePath
)

# Sends raw bytes straight to a Windows printer via the winspool API with the
# "RAW" datatype, so the printer receives our TSPL commands verbatim (the
# driver does not re-render them). This is the standard "RawPrinterHelper".

$src = @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DOCINFOW {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, ref DOCINFOW di);
  [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);

  public static void SendBytes(string printerName, byte[] bytes) {
    IntPtr h;
    if (!OpenPrinter(printerName, out h, IntPtr.Zero))
      throw new Exception("OpenPrinter failed for '" + printerName + "' (" + Marshal.GetLastWin32Error() + ")");
    try {
      DOCINFOW di = new DOCINFOW();
      di.pDocName = "Cellzen Label";
      di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, ref di)) throw new Exception("StartDocPrinter failed");
      try {
        if (!StartPagePrinter(h)) throw new Exception("StartPagePrinter failed");
        int written;
        if (!WritePrinter(h, bytes, bytes.Length, out written) || written != bytes.Length)
          throw new Exception("WritePrinter failed (" + written + "/" + bytes.Length + ")");
        EndPagePrinter(h);
      } finally {
        EndDocPrinter(h);
      }
    } finally {
      ClosePrinter(h);
    }
  }
}
"@

Add-Type -TypeDefinition $src -Language CSharp
$bytes = [System.IO.File]::ReadAllBytes($FilePath)
[RawPrinter]::SendBytes($PrinterName, $bytes)
Write-Output "OK"
