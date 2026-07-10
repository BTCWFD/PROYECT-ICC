import os
import sys
import pytest

def main():
    print("======================================================================")
    print("Starting ICC E2E Media Automation Test Suite")
    print("======================================================================")
    
    # Resolve the directory of the E2E tests
    test_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Run pytest programmatically on the test directory
    # We pass -v for verbose output
    exit_code = pytest.main(["-v", test_dir])
    
    print("\n======================================================================")
    if exit_code == 0:
        print("SUCCESS: All E2E tests passed successfully.")
        sys.exit(0)
    else:
        print(f"FAILURE: E2E tests failed with exit code: {exit_code}")
        sys.exit(exit_code)

if __name__ == "__main__":
    main()
