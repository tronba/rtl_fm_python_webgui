#!/bin/bash
# RTL-SDR Web Radio - Service Control Script
# Usage: ./radio-control.sh [start|stop|restart|status|log]

SERVICE_NAME="rtl-fm-radio"

case "$1" in
    start)
        echo "Starting RTL-SDR Web Radio..."
        sudo systemctl start $SERVICE_NAME
        sleep 2
        sudo systemctl status $SERVICE_NAME --no-pager
        ;;
    stop)
        echo "Stopping RTL-SDR Web Radio..."
        sudo systemctl stop $SERVICE_NAME
        echo "Stopped."
        ;;
    restart)
        echo "Restarting RTL-SDR Web Radio..."
        sudo systemctl restart $SERVICE_NAME
        sleep 2
        sudo systemctl status $SERVICE_NAME --no-pager
        ;;
    status)
        sudo systemctl status $SERVICE_NAME --no-pager
        ;;
    log)
        echo "Showing last 50 log entries (Ctrl+C to exit live mode)..."
        sudo journalctl -u $SERVICE_NAME -n 50 -f
        ;;
    install)
        echo "Installing RTL-SDR Web Radio service..."
        # Copy service file
        sudo cp rtl-fm-radio.service /etc/systemd/system/
        # Reload systemd
        sudo systemctl daemon-reload
        echo "Service installed. Use './radio-control.sh start' to start."
        echo ""
        echo "To enable auto-start on boot (OPTIONAL):"
        echo "  sudo systemctl enable $SERVICE_NAME"
        ;;
    uninstall)
        echo "Uninstalling RTL-SDR Web Radio service..."
        sudo systemctl stop $SERVICE_NAME 2>/dev/null
        sudo systemctl disable $SERVICE_NAME 2>/dev/null
        sudo rm -f /etc/systemd/system/rtl-fm-radio.service
        sudo systemctl daemon-reload
        echo "Service uninstalled."
        ;;
    *)
        echo "RTL-SDR Web Radio - Service Control"
        echo ""
        echo "Usage: $0 {start|stop|restart|status|log|install|uninstall}"
        echo ""
        echo "Commands:"
        echo "  install   - Install the systemd service (run once)"
        echo "  start     - Start the radio server"
        echo "  stop      - Stop the radio server"
        echo "  restart   - Restart the radio server"
        echo "  status    - Show service status"
        echo "  log       - Show live log output"
        echo "  uninstall - Remove the systemd service"
        echo ""
        echo "After install, access the web UI at: http://localhost:10100/"
        exit 1
        ;;
esac

exit 0
