//
//  Logger.swift
//
//  Created by Paolo Manna on 23/02/2021.
//  Adapted from https://stackoverflow.com/a/58697135
//

import Foundation

let knownCommands: Set<String>	= ["AddColumn", "AddInteger", "AddTable",
                              	   "ArrayErase", "ArrayInsert", "ArrayMove", "ArraySet",
                              	   "Clear", "ContainerInsert", "ContainerSet", "CreateObject",
                              	   "EraseColumn", "EraseObject", "EraseTable", "InternStrings",
                              	   "SelectField", "SelectTable", "Set", "Update"]

enum Logger {
	static let formatter = ISO8601DateFormatter()
	static var analyseTrace = false
	static var verbose = false
	static var callback: ((String) -> Void)?
	static var createdObjects	= Set<String>()
	static var erasedObjects	= Set<String>()

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
	
	fileprivate static func fileOutput(_ message: String) {
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
	
	static func log(_ message: String) {
		if analyseTrace, message.starts(with: "Sync: (7)") {
			// Analyse Trace messages
			parseTrace(message: message)
		} else {
			fileOutput(message)
		}
	}
	
	fileprivate static func parseTrace(message: String) {
		if message.contains("Changeset (parsed)") {
			var operations		= [String: Int]()
			var warnings		= [String: Int]()
			let messageLines	= message.components(separatedBy: "\n")
			
			for line in messageLines {
				let params	= line.components(separatedBy: " ").filter { !$0.isEmpty }
				
				if !(params.isEmpty || params[0].starts(with: "Sync")) {
					let command	= params[0]
					
					if knownCommands.contains(command) {
						if let count = operations[command] {
							operations[command] = count + 1
						} else {
							operations[command] = 1
						}
						
						switch command {
						case "EraseObject":
							let objectId	= params[1]
							
							if createdObjects.contains(objectId) {
								if let count = warnings["Erase existing"] {
									warnings["Erase existing"] = count + 1
								} else {
									warnings["Erase existing"] = 1
								}
								createdObjects.remove(objectId)
								erasedObjects.insert(objectId)
							}
						case "CreateObject":
							let objectId	= params[1]
							
							if erasedObjects.contains(objectId) {
								if let count = warnings["Re-creating erased"] {
									warnings["Re-creating erased"] = count + 1
								} else {
									warnings["Re-creating erased"] = 1
								}
								erasedObjects.remove(objectId)
							}
							createdObjects.insert(objectId)
						default:
							break
						}
					}
				}
			}
			
			if let logBack = callback {
				DispatchQueue.main.async {
					if !operations.isEmpty {
						let keys		= operations.keys.sorted()
						var compound	= ""
						
						for key in keys {
							compound.append("\(key): \(operations[key] ?? 0) ")
						}
						
						if verbose {
							logBack(compound)
						}
						fileOutput(compound)
					}
					
					if !warnings.isEmpty {
						logBack("Warnings: \(warnings)")
						fileOutput("\(warnings)")
					}
				}
			}
		}
	}
}
