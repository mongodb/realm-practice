//
//  Logger.swift
//
//  Created by Paolo Manna on 23/02/2021.
//  Adapted from https://stackoverflow.com/a/58697135
//

import Foundation

class Logger {
	static let formatter = ISO8601DateFormatter()
	
	static var logFile: URL? = {
		let fm	= FileManager.default
		
		guard let documentsDirectory = fm.urls(for: .documentDirectory, in: .userDomainMask).first else { return nil }
		
		formatter.formatOptions	= [.withFullDate]
		formatter.timeZone		= TimeZone(secondsFromGMT: 0)
		
		var progressive	= 0
		var fileURL: URL!
		
		repeat  {
			progressive += 1
			
			let fileName	= String(format: "%@.%@_%03d.log",
			            	         Bundle.main.bundleIdentifier ?? "??", formatter.string(from: Date()), progressive)
			
			fileURL	= documentsDirectory.appendingPathComponent(fileName)
		} while fm.fileExists(atPath: fileURL.path) && progressive < 1000
		
		formatter.formatOptions	= [.withFullDate, .withFullTime]
		
		return fileURL
	}()

	static func log(_ message: String) {
		guard let logFile = logFile else { return }

		let timestamp = formatter.string(from: Date())
		guard let data = ("[\(timestamp)]: " + message + "\n").data(using: String.Encoding.utf8) else { return }

		if FileManager.default.fileExists(atPath: logFile.path) {
			if let fileHandle = try? FileHandle(forWritingTo: logFile) {
				fileHandle.seekToEndOfFile()
				fileHandle.write(data)
				fileHandle.closeFile()
			}
		} else {
			try? data.write(to: logFile, options: .atomicWrite)
		}
	}
}
